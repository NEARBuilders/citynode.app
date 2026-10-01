import { getRuntime } from "../config/runtime.js";
import { ApiError } from "./errors.js";
import { nearRpcProvider } from "./near-rpc.js";

const walletAccountPattern = /^0s[0-9a-f]{40}$/;

type WalletAuthorizationInput = {
  accountId: string;
  authorization: string;
  expectedPayload: string;
  /** Finalized block selected by the owner-wallet code check. */
  blockId: string;
};

function validatePasskeyClaim(
  message: Record<string, unknown> | undefined,
  input: WalletAuthorizationInput,
) {
  if (
    !message ||
    message.chain_id !== getRuntime().network ||
    message.signer_id !== input.accountId ||
    message.payload !== input.expectedPayload ||
    (Array.isArray(message.path) && message.path.length !== 0) ||
    (message.path !== undefined && !Array.isArray(message.path)) ||
    typeof message.timestamp !== "string"
  )
    throw new ApiError("wallet_authorization_invalid", 401);
  const signedAt = Date.parse(message.timestamp);
  if (
    !Number.isFinite(signedAt) ||
    signedAt > Date.now() + 30_000 ||
    signedAt < Date.now() - 300_000
  )
    throw new ApiError("wallet_authorization_expired", 409);
}

function validateEvmClaim(authorization: unknown, recipient: string, expectedPayload: string) {
  const claim = authorization as { recipient?: unknown; payload?: unknown; signature?: unknown };
  if (
    claim.recipient !== recipient ||
    claim.payload !== expectedPayload ||
    typeof claim.signature !== "string"
  )
    throw new ApiError("wallet_authorization_invalid", 401);
}

function validatedAuthorization(input: WalletAuthorizationInput) {
  if (!walletAccountPattern.test(input.accountId) || input.authorization.length > 32_768)
    throw new ApiError("wallet_authorization_invalid", 400);
  let authorization: unknown;
  try {
    authorization = JSON.parse(input.authorization);
  } catch {
    throw new ApiError("wallet_authorization_invalid", 400);
  }
  const evm =
    authorization &&
    typeof authorization === "object" &&
    (authorization as { purpose?: unknown }).purpose === "PROVE_OWNERSHIP";
  const signed = (authorization as { signature?: { msg?: Record<string, unknown> } })?.signature;
  const message = signed?.msg;
  if (!evm) validatePasskeyClaim(message, input);
  const payload = JSON.parse(input.expectedPayload) as { recipient?: unknown };
  if (typeof payload.recipient !== "string")
    throw new ApiError("wallet_authorization_invalid", 401);
  if (evm) validateEvmClaim(authorization, payload.recipient, input.expectedPayload);
  return { evm, recipient: payload.recipient };
}

/** Resolve one NEP-641 proof against finalized wallet-contract state. */
export async function verifyWalletAuthorization(input: WalletAuthorizationInput): Promise<void> {
  const { evm, recipient } = validatedAuthorization(input);
  let result: number[];
  try {
    const response = await nearRpcProvider().callFunctionRaw({
      contractId: input.accountId,
      method: "w_resolve_auth",
      args: evm
        ? { purpose: "PROVE_OWNERSHIP", recipient, authorization: input.authorization }
        : { path: [], authorization: input.authorization },
      blockQuery: { blockId: input.blockId },
    });
    if (response.block_hash !== input.blockId)
      throw new ApiError("wallet_resolver_unavailable", 503);
    result = response.result;
  } catch {
    throw new ApiError("wallet_resolver_unavailable", 503);
  }
  let resolution: unknown;
  try {
    resolution = JSON.parse(Buffer.from(result).toString("utf8"));
  } catch {
    throw new ApiError("wallet_authorization_unresolved", 401);
  }
  const resolved = resolution as { payload?: unknown; pending?: unknown } | null;
  if (
    !resolved ||
    typeof resolved !== "object" ||
    resolved.payload !== input.expectedPayload ||
    (resolved.pending !== undefined &&
      (!Array.isArray(resolved.pending) || resolved.pending.length !== 0))
  )
    throw new ApiError("wallet_authorization_invalid", 401);
}
