import {
  canonical,
  type EvmWalletRequestMessage,
  evmAuthorizationTypedData,
  evmWalletRequestMessageSchema,
  evmWalletTypedData,
  type OffchainMessage,
  type OnboardingSignature,
  type OwnerProof,
  type OwnerWallet,
  offchainMessageHash,
  type PolicyOperationResult,
  type SignedNearPolicy,
  type SignedWalletRequest,
  type WalletRequestMessage,
  walletRequestHash,
  walletRequestMessageSchema,
} from "@near-intents-agent-api/contracts";
import type { Intent, SignedData } from "@near-intents-agent-api/contracts/api";
import {
  evmWalletSignature,
  nearSignatureHex,
  passkeyWalletProof,
  WalletOutputError,
} from "@near-intents-agent-api/owner-auth";
import { ApiError } from "../../shared/errors.js";

/**
 * Wallet payloads, one per owner type, and the reverse mapping from a wallet's raw output to the
 * proof formats the owner verifiers already check.
 *
 * Two families exist:
 * - consent: the owner signs a canonical JSON message (grant, revoke, timelock, …) with NEP-413
 *   (NEAR), an EIP-712 `PROVE_OWNERSHIP` wallet authorization (EVM) or a NEP-641 offchain
 *   message (passkey);
 * - wallet request: the owner signs the exact on-chain policy request, as a NEP-366 delegate
 *   (NEAR), an EIP-712 wallet message (EVM) or a WebAuthn assertion over the NEP-616 request
 *   hash (passkey).
 */

/** How long an authenticator may show its prompt. */
const webauthnTimeoutMs = 120_000;
/** NEP-641 wallets accept a timestamp at most five minutes old; sign well inside that. */
const offchainTimestampSkewMs = 30_000;
const offchainMaxAgeMs = 300_000;

type ConsentMessage = { owner: OwnerWallet; nonce: string; recipient: string };

/** Server-side data stored with a consent intent. */
export type ConsentContext = {
  family: "consent";
  message: ConsentMessage & Record<string, unknown>;
  offchain?: OffchainMessage;
};

/** Server-side data stored with a wallet-request intent. */
export type WalletRequestContext = {
  family: "wallet_request";
  walletRequest?: WalletRequestMessage | EvmWalletRequestMessage;
};

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

function webauthnPayload(
  owner: Extract<OwnerWallet, { type: "passkey" }>,
  challenge: Uint8Array,
): Extract<Intent, { standard: "webauthn" }> {
  return {
    standard: "webauthn",
    payload: {
      challenge: base64url(challenge),
      rpId: owner.rpId,
      allowCredentials: [{ id: owner.credentialId, type: "public-key" }],
      userVerification: "required",
      timeout: webauthnTimeoutMs,
    },
  };
}

/**
 * The payload an owner signs to consent to one canonical message. `ownerAccountId` is the bound
 * owner's NEAR authority account; a passkey signs for its `0s` wallet.
 */
export function consentIntent(
  owner: OwnerWallet,
  ownerAccountId: string,
  message: ConsentMessage & Record<string, unknown>,
  now = Date.now(),
): { intent: Intent; context: ConsentContext; expiresAtMs: number } {
  const text = canonical(message);
  switch (owner.type) {
    case "near":
      return {
        intent: {
          standard: "nep413",
          payload: {
            message: text,
            recipient: message.recipient,
            nonce: Buffer.from(message.nonce, "hex").toString("base64"),
          },
        },
        context: { family: "consent", message },
        expiresAtMs: Number.POSITIVE_INFINITY,
      };
    case "evm":
      return {
        intent: {
          standard: "eip712",
          payload: evmAuthorizationTypedData({
            purpose: "PROVE_OWNERSHIP",
            recipient: message.recipient,
            payload: text,
          }),
        },
        context: { family: "consent", message },
        expiresAtMs: Number.POSITIVE_INFINITY,
      };
    case "passkey": {
      const signedAt = now - offchainTimestampSkewMs;
      const offchain: OffchainMessage = {
        chain_id: "mainnet",
        signer_id: ownerAccountId,
        timestamp: new Date(signedAt).toISOString(),
        payload: text,
      };
      return {
        intent: webauthnPayload(owner, offchainMessageHash(offchain)),
        context: { family: "consent", message, offchain },
        expiresAtMs: signedAt + offchainMaxAgeMs,
      };
    }
  }
}

/** The payload an owner signs to authorize one prepared on-chain policy request. */
export function walletRequestIntent(
  owner: OwnerWallet,
  prepared: Pick<PolicyOperationResult, "near_policy_request" | "wallet_request">,
): { intent: Intent; context: WalletRequestContext; expiresAtMs: number } {
  if (owner.type === "near") {
    const request = prepared.near_policy_request;
    if (!request) throw new ApiError("wallet_request_type_mismatch", 409);
    return {
      intent: {
        standard: "nep366",
        payload: {
          receiverId: request.receiver_id,
          actions: request.actions.map((action) => ({
            type: "FunctionCall" as const,
            params: {
              methodName: action.methodName,
              args: jsonArgs(action.argsBase64),
              gas: action.gas,
              deposit: action.depositYocto,
            },
          })),
        },
      },
      context: { family: "wallet_request" },
      expiresAtMs: Number.POSITIVE_INFINITY,
    };
  }
  const request = prepared.wallet_request;
  if (!request) throw new ApiError("wallet_request_type_mismatch", 409);
  const expiresAtMs = Date.parse(request.created_at) + request.timeout_secs * 1000;
  if (owner.type === "evm") {
    const message = evmWalletRequestMessageSchema.parse(request);
    return {
      intent: { standard: "eip712", payload: evmWalletTypedData(message) },
      context: { family: "wallet_request", walletRequest: message },
      expiresAtMs,
    };
  }
  const message = walletRequestMessageSchema.parse(request);
  return {
    intent: webauthnPayload(owner, walletRequestHash(message)),
    context: { family: "wallet_request", walletRequest: message },
    expiresAtMs,
  };
}

/**
 * Policy call arguments are JSON. A wallet re-serializes `args` with `JSON.stringify`, so the
 * bytes only survive the round trip when the prepared bytes are exactly that serialization.
 */
function jsonArgs(argsBase64: string): Record<string, unknown> {
  const text = Buffer.from(argsBase64, "base64").toString("utf8");
  const parsed = JSON.parse(text) as unknown;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    JSON.stringify(parsed) !== text
  )
    throw new Error("policy_args_not_json");
  return parsed as Record<string, unknown>;
}

/** Refuses a submission whose payload is not byte-identical to the generated one. */
export function assertSamePayload(intent: Intent, signed: SignedData) {
  if (intent.standard !== signed.standard) throw new ApiError("intent_standard_mismatch", 409);
  if (canonical(intent.payload) !== canonical(signed.payload))
    throw new ApiError("intent_payload_mismatch", 409);
}

function walletOutput<T>(convert: () => T): T {
  try {
    return convert();
  } catch (error) {
    if (error instanceof WalletOutputError) throw new ApiError(error.code, 400);
    throw error;
  }
}

/** Converts a consent signature into the owner proof its verifier checks. */
export function consentProof(
  owner: OwnerWallet,
  context: ConsentContext,
  signed: SignedData,
): OwnerProof {
  switch (signed.standard) {
    case "nep413":
      if (owner.type !== "near") throw new ApiError("intent_standard_mismatch", 409);
      if (signed.public_key !== owner.publicKey) throw new ApiError("signer_mismatch", 409);
      return { signature: walletOutput(() => nearSignatureHex(signed.signature)) };
    case "eip712": {
      if (owner.type !== "evm") throw new ApiError("intent_standard_mismatch", 409);
      const message = signed.payload.message as Record<string, unknown>;
      return {
        walletAuthorization: JSON.stringify({
          purpose: message.purpose,
          recipient: message.recipient,
          payload: message.payload,
          signature: walletOutput(() => evmWalletSignature(signed.signature)),
        }),
      };
    }
    case "webauthn": {
      if (owner.type !== "passkey" || !context.offchain)
        throw new ApiError("intent_standard_mismatch", 409);
      if (signed.credential.id !== owner.credentialId) throw new ApiError("signer_mismatch", 409);
      return {
        walletAuthorization: JSON.stringify({
          signature: {
            msg: context.offchain,
            proof: walletOutput(() => passkeyWalletProof(signed.credential)),
          },
        }),
      };
    }
    case "nep366":
      throw new ApiError("intent_standard_mismatch", 409);
  }
}

/** Converts a wallet-request signature into the submission the policy relay verifies. */
export function walletRequestSubmission(
  owner: OwnerWallet,
  context: WalletRequestContext,
  signed: SignedData,
  idempotencyKey: string,
): (SignedWalletRequest | SignedNearPolicy) & OnboardingSignature {
  switch (signed.standard) {
    case "nep366":
      if (owner.type !== "near") throw new ApiError("intent_standard_mismatch", 409);
      return { signedDelegate: signed.signedDelegate } as SignedNearPolicy & OnboardingSignature;
    case "eip712": {
      if (owner.type !== "evm" || !context.walletRequest)
        throw new ApiError("intent_standard_mismatch", 409);
      const message = evmWalletRequestMessageSchema.parse(context.walletRequest);
      const typed = evmWalletTypedData(message);
      return {
        msg: message,
        proof: JSON.stringify({
          ...typed.message,
          signature: walletOutput(() => evmWalletSignature(signed.signature)),
        }),
        idempotencyKey,
      };
    }
    case "webauthn": {
      if (owner.type !== "passkey" || !context.walletRequest)
        throw new ApiError("intent_standard_mismatch", 409);
      if (signed.credential.id !== owner.credentialId) throw new ApiError("signer_mismatch", 409);
      return {
        msg: walletRequestMessageSchema.parse(context.walletRequest),
        proof: walletOutput(() => passkeyWalletProof(signed.credential)),
        idempotencyKey,
      };
    }
    case "nep413":
      throw new ApiError("intent_standard_mismatch", 409);
  }
}

/** NEP-413 payload for a provider approval vote, signed by a NEAR approver. */
export function approvalVoteIntent(input: {
  message: string;
  recipient: string;
  nonceHex: string;
}): Intent {
  return {
    standard: "nep413",
    payload: {
      message: input.message,
      recipient: input.recipient,
      nonce: Buffer.from(input.nonceHex, "hex").toString("base64"),
    },
  };
}

export function approvalVoteSignature(signed: SignedData, publicKey: string) {
  if (signed.standard !== "nep413") throw new ApiError("intent_standard_mismatch", 409);
  if (signed.public_key !== publicKey) throw new ApiError("signer_mismatch", 409);
  return walletOutput(() => nearSignatureHex(signed.signature));
}
