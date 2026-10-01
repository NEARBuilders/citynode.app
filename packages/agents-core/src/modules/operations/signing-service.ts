import {
  canonical,
  type EvmSignMessage,
  type EvmSignTransaction,
  type EvmSignTypedData,
  evmSignatureSchema,
  policySchema,
  type Signature,
  type SignMessage,
} from "@near-intents-agent-api/contracts";
import { getOutlayer } from "../../lib/outlayer.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { type GrantCheck, grantCheckForIdentitySigning } from "../agents/grant-constraints.js";
import { authorizeDelegatedAction } from "../agents/grant-service.js";
import { requireBoundAgent } from "../agents/service.js";
import { requireReadyPolicy } from "../wallet/policy-readiness.js";
import { latestAppliedPolicy } from "../wallet/repository.js";
import { custodyCredential } from "../wallet/service.js";
import { assertDispatchFence, commitDispatch } from "./dispatch-fence.js";
import { parseIdentitySigningMessage } from "./identity-signing.js";
import { type Operation, runOperation } from "./service.js";

type SigningWallet = Awaited<ReturnType<typeof requireBoundAgent>>["wallet"];

async function runSigningOperation<TInput extends { idempotencyKey: string }, TResult>(
  actor: Actor,
  agentId: string,
  grantToken: string | undefined,
  action: "near_message" | "evm_message",
  input: TInput,
  check: GrantCheck,
  run: (wallet: SigningWallet, operationId: string) => Promise<TResult>,
  prepare?: (wallet: SigningWallet) => void | Promise<void>,
  validateBeforeDispatch?: () => void | Promise<void>,
): Promise<Operation> {
  const { wallet } = await requireBoundAgent(actor, agentId);
  await requireReadyPolicy(actor.tenantId, agentId);
  // Detached signatures are authorization artifacts. The owner must have delegated this exact
  // signing action to the grant the caller's token names, not merely have issued a tenant key.
  const decision = await authorizeDelegatedAction({
    actor,
    agentId,
    grant: { token: grantToken },
    action: `sign:${action}`,
    check,
    walletId: wallet.providerWalletId,
  });
  await prepare?.(wallet);
  return runOperation({
    actor,
    agentId,
    kind: "sign",
    action: `sign:${action}`,
    idempotencyKey: input.idempotencyKey,
    request: input,
    grant: { id: decision.grantId, label: decision.label },
    authorizationEpochs: decision.authorizationEpochs,
    signingAction: action,
    run: async (operationId) => {
      // A detached signature is as good as the grant it was authorized under: re-check the
      // epochs at the commitment point so a revocation between admission and signing fails.
      await assertDispatchFence(actor.tenantId, agentId, operationId);
      await requireReadyPolicy(actor.tenantId, agentId);
      await assertDispatchFence(actor.tenantId, agentId, operationId);
      await validateBeforeDispatch?.();
      // Identity-policy validation reads the current policy asynchronously. Commit after that
      // read, immediately before requesting the detached signature.
      await commitDispatch(actor.tenantId, agentId, operationId);
      return run(wallet, operationId);
    },
  });
}

/**
 * NEP-413 signing with the agent custody wallet. The provider enforces its own
 * recipient allowlist; policy is the authority boundary, not this server.
 */
export async function signMessage(
  actor: Actor,
  agentId: string,
  input: SignMessage,
  grantToken: string | undefined,
) {
  if (!input.recipient) throw new ApiError("sign_recipient_required");
  const message = parseIdentitySigningMessage(
    decodeMessage(input.message, input.encoding),
    "near",
    input.recipient,
  );
  return runSigningOperation(
    actor,
    agentId,
    grantToken,
    "near_message",
    input,
    grantCheckForIdentitySigning(message.audience),
    async (wallet, operationId) => {
      const nonce = Buffer.from(operationId, "hex").toString("base64");
      const response = await getOutlayer().signNearMessage(custodyCredential(wallet), {
        message: canonical(message),
        recipient: message.audience,
        nonce,
      });
      return {
        ...signatureSchemaFor(response, wallet.nearAccountId),
        nonce,
        recipient: message.audience,
      };
    },
    () => requireIdentitySigningPolicy(actor.tenantId, agentId, message),
    async () => {
      parseIdentitySigningMessage(canonical(message), "near", message.audience);
      await requireIdentitySigningPolicy(actor.tenantId, agentId, message);
    },
  );
}

export async function signEvmMessage(
  actor: Actor,
  agentId: string,
  input: EvmSignMessage,
  grantToken: string | undefined,
) {
  const message = parseIdentitySigningMessage(
    decodeMessage(input.message, input.encoding),
    input.chain,
  );
  return runSigningOperation(
    actor,
    agentId,
    grantToken,
    "evm_message",
    input,
    grantCheckForIdentitySigning(message.audience),
    async (wallet) => {
      const response = await getOutlayer().signEvmMessage(custodyCredential(wallet), {
        chain: input.chain,
        encoding: "utf8",
        message: canonical(message),
      });
      return normalizeEvmSignature(response.address, response.signature, wallet.evmAddress);
    },
    () => requireIdentitySigningPolicy(actor.tenantId, agentId, message),
    async () => {
      parseIdentitySigningMessage(canonical(message), input.chain, message.audience);
      await requireIdentitySigningPolicy(actor.tenantId, agentId, message);
    },
  );
}

export async function signEvmTypedData(
  _actor: Actor,
  _agentId: string,
  _input: EvmSignTypedData,
): Promise<never> {
  throw new ApiError("signing_format_unsupported", 403);
}

export async function signEvmTransaction(
  _actor: Actor,
  _agentId: string,
  _input: EvmSignTransaction,
): Promise<never> {
  throw new ApiError("signing_format_unsupported", 403);
}

async function requireIdentitySigningPolicy(
  tenantId: string,
  agentId: string,
  challenge: ReturnType<typeof parseIdentitySigningMessage>,
) {
  const record = await latestAppliedPolicy(tenantId, agentId);
  if (!record) throw new ApiError("policy_not_ready", 409);
  const parsed = policySchema.safeParse(record.rules);
  if (!parsed.success) throw new ApiError("policy_not_ready", 409);
  const allowed =
    challenge.chain === "near"
      ? parsed.data.capabilities.sign_message.allowed &&
        !parsed.data.capabilities.sign_message.requires_approval &&
        parsed.data.capabilities.sign_message.allowed_recipients.includes(challenge.audience)
      : parsed.data.capabilities.evm_sign.allowed;
  if (!allowed) throw new ApiError("signing_policy_denied", 403);
}

function signatureSchemaFor(
  response: { public_key?: string; signature?: string; signature_base64?: unknown },
  fallbackAccountId: string,
): Omit<Signature, "nonce" | "recipient"> {
  const signature = normalizeNearSignature(response);
  if (!signature) throw new ApiError("provider_signature_invalid", 502);
  if (!response.public_key) throw new ApiError("provider_signature_invalid", 502);
  return {
    near_account_id: fallbackAccountId,
    public_key: response.public_key,
    signature,
  };
}

function normalizeNearSignature(response: { signature?: string; signature_base64?: unknown }) {
  if (response.signature && /^[0-9a-f]{128}$/.test(response.signature)) return response.signature;
  if (typeof response.signature_base64 !== "string") return null;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(response.signature_base64)) return null;
  const bytes = Buffer.from(response.signature_base64, "base64");
  return bytes.length === 64 ? bytes.toString("hex") : null;
}

function normalizeEvmSignature(
  address: string | null | undefined,
  signature: string | null | undefined,
  fallbackAddress: string,
) {
  const resolvedAddress = address ?? fallbackAddress;
  if (!/^0x[0-9a-fA-F]{40}$/.test(fallbackAddress) || !/^0x[0-9a-fA-F]{40}$/.test(resolvedAddress))
    throw new ApiError("evm_address_unavailable", 409);
  if (resolvedAddress.toLowerCase() !== fallbackAddress.toLowerCase())
    throw new ApiError("provider_signature_invalid", 502);
  if (!signature || !/^0x[0-9a-fA-F]{130}$/.test(signature))
    throw new ApiError("provider_signature_invalid", 502);
  return evmSignatureSchema.parse({ evm_address: fallbackAddress.toLowerCase(), signature });
}

function decodeMessage(message: string, encoding: "utf8" | "hex" | undefined) {
  if (encoding === "hex" && !/^(?:[0-9a-fA-F]{2})*$/.test(message))
    throw new ApiError("invalid_hex_payload");
  if (encoding !== "hex") return message;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(message, "hex"));
  } catch {
    throw new ApiError("invalid_utf8_payload");
  }
}
