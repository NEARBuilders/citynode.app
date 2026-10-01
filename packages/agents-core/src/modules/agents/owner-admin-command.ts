import type {
  AgentAdminCommandMessage,
  OwnerProof,
  OwnerWallet,
} from "@near-intents-agent-api/contracts";
import { getRuntime } from "../../config/runtime.js";
import type { Actor } from "../../shared/actor.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { issueOwnerNonce } from "../../shared/nonces.js";
import {
  ownerEnvelopeMismatch,
  ownerMessageMaxLifetimeMs,
  ownerMessageWindowInvalid,
} from "../../shared/owner-message.js";
import { verifyBoundOwner } from "./owner-authorization.js";
import type { AgentRecord } from "./repository.js";
import { ownerMessageRecipient } from "./service.js";

export type OwnerAdminAction = AgentAdminCommandMessage["action"];
export type OwnerAdminMessageFor<A extends OwnerAdminAction> = Extract<
  AgentAdminCommandMessage,
  { action: A }
>;

/** Issues one exact owner consent envelope for an owner-only command. */
export async function ownerAdminCommandChallenge<A extends OwnerAdminAction>(
  actor: Actor,
  agent: AgentRecord,
  action: A,
  targetId: string,
): Promise<OwnerAdminMessageFor<A>> {
  if (!agent.ownerIdentity) throw new ApiError("agent_not_bound", 409);
  const issuedAtMs = Date.now();
  return {
    domain: "near-intents-agent-api.owner-admin.v2",
    action,
    owner: agent.ownerIdentity,
    tenant_id: actor.tenantId,
    agent_id: agent.id,
    network: getRuntime().network,
    owner_epoch: agent.ownerEpoch,
    target_id: targetId,
    recipient: ownerMessageRecipient(),
    nonce: await issueOwnerNonce(actor.tenantId, agent.id),
    issued_at_ms: issuedAtMs,
    expires_at_ms: issuedAtMs + ownerMessageMaxLifetimeMs,
  } as OwnerAdminMessageFor<A>;
}

/** Rejects stale or redirected commands before proof verification or state changes. */
export function assertOwnerAdminCommand(
  actor: Actor,
  agent: AgentRecord,
  action: OwnerAdminAction,
  targetId: string,
  message: AgentAdminCommandMessage,
) {
  if (message.domain !== "near-intents-agent-api.owner-admin.v2")
    throw new ApiError("owner_command_domain_invalid", 409);
  if (
    ownerEnvelopeMismatch(message, actor.tenantId, agent.id) ||
    message.recipient !== ownerMessageRecipient()
  )
    throw new ApiError("owner_mismatch", 409);
  if (message.action !== action || message.target_id !== targetId)
    throw new ApiError("owner_command_target_mismatch", 409);
  if (message.owner_epoch !== agent.ownerEpoch) throw new ApiError("owner_command_stale", 409);
  if (ownerMessageWindowInvalid(message, Date.now()))
    throw new ApiError("owner_command_expired", 409);
}

export async function verifyOwnerAdminCommand(
  agent: AgentRecord,
  message: AgentAdminCommandMessage,
  proof: OwnerProof,
) {
  return verifyBoundOwner(agent, message, proof);
}

/** Stable audit principal, separate from the tenant API key that submitted the command. */
export function ownerPrincipalId(owner: OwnerWallet): string {
  switch (owner.type) {
    case "near":
      return `near:${owner.accountId}:${owner.publicKey}`;
    case "evm":
      return `evm:${owner.chainId}:${owner.address}`;
    case "passkey":
      return `passkey:${hashSecret(owner.credentialId)}`;
  }
}
