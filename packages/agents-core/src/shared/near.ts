import { JsonRpcProvider, PublicKey } from "near-api-js";
import { verifyMessage } from "near-api-js/nep413";
import { getRuntime } from "../config/runtime.js";
import { defaultedSlot } from "../lib/slot.js";
import { ApiError } from "./errors.js";
import { nearRpcProvider } from "./near-rpc.js";

export type NearKeyVerifier = {
  verify(input: {
    accountId: string;
    publicKey: string;
    message: string;
    nonceHex: string;
    recipient: string;
    signatureHex: string;
  }): Promise<void>;
};

const liveVerifier: NearKeyVerifier = {
  async verify(input) {
    const nonce = Buffer.from(input.nonceHex, "hex");
    if (nonce.length !== 32) throw new ApiError("invalid_nonce");
    let signerPublicKey: PublicKey;
    try {
      signerPublicKey = PublicKey.from(input.publicKey);
    } catch {
      throw new ApiError("invalid_public_key");
    }
    let transportError: unknown;
    for (const url of getRuntime().nearRpcUrls) {
      try {
        await verifyMessage({
          signerAccountId: input.accountId,
          signerPublicKey,
          payload: { message: input.message, nonce, recipient: input.recipient },
          signature: Buffer.from(input.signatureHex, "hex"),
          provider: new JsonRpcProvider({ url }),
        });
        return;
      } catch (error) {
        if (!isRpcTransportFailure(error)) throw error;
        transportError = error;
      }
    }
    throw transportError;
  },
};

const slot = defaultedSlot<NearKeyVerifier>(liveVerifier);

export function nearProvider() {
  // Bounded retry budget per endpoint, then failover to the next configured RPC.
  return nearRpcProvider();
}

type NearWalletPolicyView = { owner?: unknown };

export type NearPolicyOwnerVerifier = {
  verify(input: { contractId: string; nearAccountId: string }): Promise<string | null>;
};

export type PolicyOwnerFreshness = "fresh" | "cached";

export function isSupportedNearPolicyAccountId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

const livePolicyOwnerVerifier: NearPolicyOwnerVerifier = {
  async verify({ contractId, nearAccountId }) {
    const policy = await nearProvider().callFunction<NearWalletPolicyView>({
      contractId,
      method: "get_wallet_policy",
      args: { wallet_pubkey: `ed25519:${nearAccountId}` },
      blockQuery: { finality: "final" },
    });
    return policy && typeof policy.owner === "string" ? policy.owner : null;
  },
};

const policyOwnerVerifierSlot = defaultedSlot(livePolicyOwnerVerifier);

export type NearAccountReader = { exists(accountId: string): Promise<boolean> };

/**
 * One endpoint at a time, like the key verifier: the failover provider retries every error,
 * including a definitive "account does not exist", and then reports only `RetriesExceeded`.
 */
const liveAccountReader: NearAccountReader = {
  async exists(accountId) {
    let transportError: unknown;
    for (const url of getRuntime().nearRpcUrls) {
      try {
        await new JsonRpcProvider({ url }).viewAccount({
          accountId,
          blockQuery: { finality: "final" },
        });
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === "AccountDoesNotExistError") return false;
        if (!isRpcTransportFailure(error)) throw error;
        transportError = error;
      }
    }
    throw transportError;
  },
};

const accountReaderSlot = defaultedSlot(liveAccountReader);

/** Tests may replace the chain reader explicitly; production always uses finalized NEAR RPC. */
export function configureNearAccountReader(next: NearAccountReader | undefined) {
  accountReaderSlot.set(next);
}

/** Whether a NEAR account exists at final finality. An unfunded implicit account does not. */
export function nearAccountExists(accountId: string): Promise<boolean> {
  return accountReaderSlot.get().exists(accountId);
}

/** Tests may replace the chain reader explicitly; production always uses finalized NEAR RPC. */
export function configureNearPolicyOwnerVerifier(next: NearPolicyOwnerVerifier | undefined) {
  policyOwnerVerifierSlot.set(next);
  invalidatePolicyOwnerCache();
}

/** Short-lived cache used only by callers that explicitly tolerate stale read projections. */
const policyOwnerTtlMs = 30_000;
const policyOwnerCache = new Map<string, { value: string | null; expiresAt: number }>();
let policyOwnerCacheRevision = 0;
let policyOwnerCacheSweep: ReturnType<typeof setTimeout> | undefined;

function schedulePolicyOwnerCacheSweep() {
  if (policyOwnerCacheSweep || policyOwnerCache.size === 0) return;
  let nextExpiry = Number.POSITIVE_INFINITY;
  for (const entry of policyOwnerCache.values()) {
    nextExpiry = Math.min(nextExpiry, entry.expiresAt);
  }
  policyOwnerCacheSweep = setTimeout(
    () => {
      policyOwnerCacheSweep = undefined;
      const now = Date.now();
      for (const [key, entry] of policyOwnerCache) {
        if (entry.expiresAt <= now) policyOwnerCache.delete(key);
      }
      schedulePolicyOwnerCacheSweep();
    },
    Math.max(0, nextExpiry - Date.now()),
  );
  policyOwnerCacheSweep.unref();
}

/** Drops cached ownership, e.g. after a policy write has been confirmed on chain. */
export function invalidatePolicyOwnerCache(contractId?: string, nearAccountId?: string) {
  policyOwnerCacheRevision += 1;
  if (!contractId || !nearAccountId) {
    policyOwnerCache.clear();
  } else {
    policyOwnerCache.delete(`${contractId}\u0000${nearAccountId}`);
  }
  if (policyOwnerCache.size === 0 && policyOwnerCacheSweep) {
    clearTimeout(policyOwnerCacheSweep);
    policyOwnerCacheSweep = undefined;
  }
}

export async function nearPolicyOwner(
  contractId: string,
  nearAccountId: string,
  freshness: PolicyOwnerFreshness = "fresh",
) {
  if (!isSupportedNearPolicyAccountId(nearAccountId)) return null;
  const key = `${contractId}\u0000${nearAccountId}`;
  const cached = policyOwnerCache.get(key);
  if (freshness === "cached" && cached && cached.expiresAt > Date.now()) return cached.value;
  const cacheRevision = policyOwnerCacheRevision;
  const owner = await policyOwnerVerifierSlot.get().verify({ contractId, nearAccountId });
  // A chain write may invalidate while this read is in flight. Do not repopulate stale evidence.
  if (cacheRevision === policyOwnerCacheRevision) {
    policyOwnerCache.set(key, { value: owner, expiresAt: Date.now() + policyOwnerTtlMs });
    schedulePolicyOwnerCacheSweep();
  }
  return owner;
}

/** Verifies custody ownership from the chain. Provider-reported controller is never authority. */
export async function nearPolicyOwnerMatches(input: {
  contractId: string;
  nearAccountId: string;
  expectedOwner: string | null;
  freshness?: PolicyOwnerFreshness;
}) {
  if (!isSupportedNearPolicyAccountId(input.nearAccountId) || !input.expectedOwner) return false;
  const owner = await nearPolicyOwner(input.contractId, input.nearAccountId, input.freshness);
  return owner !== null && owner === input.expectedOwner;
}

export function configureNearVerifier(next: NearKeyVerifier | undefined) {
  slot.set(next);
}

export type NearAccessKeyVerifier = {
  /** Resolves when `publicKey` is a live FullAccess key of `accountId` at final finality. */
  verifyFullAccess(input: { accountId: string; publicKey: string }): Promise<void>;
};

const liveAccessKeyVerifier: NearAccessKeyVerifier = {
  async verifyFullAccess({ accountId, publicKey }) {
    let permission: unknown;
    try {
      permission = (
        await nearProvider().viewAccessKey({
          accountId,
          publicKey,
          finalityQuery: { finality: "final" },
        })
      ).permission;
    } catch (error) {
      if (isRpcTransportFailure(error)) throw new ApiError("owner_verification_unavailable", 502);
      throw new ApiError("owner_key_not_full_access", 403);
    }
    if (permission !== "FullAccess") throw new ApiError("owner_key_not_full_access", 403);
  },
};

const accessKeyVerifierSlot = defaultedSlot<NearAccessKeyVerifier>(liveAccessKeyVerifier);

/** Tests may replace the access-key reader; production reads finalized NEAR RPC. */
export function configureNearAccessKeyVerifier(next: NearAccessKeyVerifier | undefined) {
  accessKeyVerifierSlot.set(next);
}

/** A named NEAR owner must sign with a live FullAccess key; checked before any sponsor spend. */
export function verifyNearFullAccessKey(accountId: string, publicKey: string) {
  return accessKeyVerifierSlot.get().verifyFullAccess({ accountId, publicKey });
}

/**
 * Verifies a NEP-413 owner proof and requires the named full-access key on the named
 * account. The account name alone never proves ownership.
 *
 * A signature that does not verify is `owner_proof_invalid` (401). An RPC that never answered is
 * a dependency failure (502): conflating the two turns a transient outage into a permanent-looking
 * "invalid signature" for every owner. Missing account/key on chain stays 401, because that is a
 * real property of the proof, not a transport problem.
 */
export async function verifyNearOwnerProof(input: {
  accountId: string;
  publicKey: string;
  message: string;
  nonceHex: string;
  signatureHex: string;
  recipient: string;
}) {
  try {
    await slot.get().verify(input);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (message.includes("FullAccess")) throw new ApiError("owner_key_not_full_access", 403);
    if (isRpcTransportFailure(error)) throw new ApiError("owner_verification_unavailable", 502);
    throw new ApiError("owner_proof_invalid", 401);
  }
}

/**
 * Distinguishes "the chain answered" from "the chain never answered".
 *
 * `near-api-js` raises `RpcError` subclasses for protocol-level answers (including
 * `UNKNOWN_ACCOUNT`), `ProviderError` for HTTP failures and `TypedError` for exhausting its own
 * retries. `ProviderError` is not publicly exported and does not survive a bundled `instanceof`
 * intact, so this classifies structurally: a transport failure is an error with no RPC status,
 * carrying a numeric HTTP code and no protocol `type` of its own.
 */
export function isRpcTransportFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; type?: unknown; cause?: unknown };
  if (value.type === "RetriesExceeded") return true;
  if (value.name === "ProviderError") return true;
  // ProviderError sets `cause` to the HTTP status number.
  if (typeof value.cause === "number") return true;
  const message = (error as { message?: unknown }).message;
  if (typeof message === "string") {
    return (
      message.includes("Timeout error") ||
      message.includes("Bad Gateway") ||
      message.includes("unavailable") ||
      message.includes("Internal server error") ||
      /failed to fetch|fetch failed|network/i.test(message)
    );
  }
  return false;
}
