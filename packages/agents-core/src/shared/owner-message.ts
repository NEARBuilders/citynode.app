import { getRuntime } from "../config/runtime.js";

/**
 * Every owner-signed envelope repeats the same three bindings and the same freshness window.
 * These are predicates, not throwers: each ceremony answers a stale or mismatched message with
 * its own error code and status, and those codes are part of the wire contract.
 */

/** Skew allowance for a message issued slightly ahead of this server's clock. */
export const ownerMessageGraceMs = 60_000;
/** Longest window an owner challenge may authorize; a signed consent is not standing authority. */
export const ownerMessageMaxLifetimeMs = 300_000;

type OwnerEnvelope = {
  tenant_id: string;
  agent_id: string;
  network: string;
};

type OwnerLifetime = {
  issued_at_ms: number;
  expires_at_ms: number;
};

type OwnerBinding = {
  account_id?: string | null;
  public_key?: string | null;
};

/** Tenant, agent and network must all match the resource the ceremony is about. */
export function ownerEnvelopeMismatch(
  message: OwnerEnvelope,
  tenantId: string,
  agentId: string,
): boolean {
  return (
    message.tenant_id !== tenantId ||
    message.agent_id !== agentId ||
    message.network !== getRuntime().network
  );
}

/** The signed message binds the bound owner's custody account and key. */
export function ownerKeyMismatch(
  message: OwnerBinding,
  agent: { ownerAccountId: string | null; ownerPublicKey: string | null },
): boolean {
  return message.account_id !== agent.ownerAccountId || message.public_key !== agent.ownerPublicKey;
}

export function ownerMessageExpired(message: OwnerLifetime, now: number): boolean {
  return message.expires_at_ms <= now;
}

export function ownerMessageIssuedInFuture(message: OwnerLifetime, now: number): boolean {
  return message.issued_at_ms > now + ownerMessageGraceMs;
}

/** A window that never closes, or one longer than a challenge may authorize. */
export function ownerMessageLifetimeInvalid(message: OwnerLifetime): boolean {
  return (
    message.expires_at_ms <= message.issued_at_ms ||
    message.expires_at_ms - message.issued_at_ms > ownerMessageMaxLifetimeMs
  );
}

/** Expired, issued in the future, or a malformed window: the full freshness rule. */
export function ownerMessageWindowInvalid(message: OwnerLifetime, now: number): boolean {
  return (
    ownerMessageIssuedInFuture(message, now) ||
    ownerMessageExpired(message, now) ||
    ownerMessageLifetimeInvalid(message)
  );
}
