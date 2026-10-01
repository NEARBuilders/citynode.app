import type { OwnerWallet } from "@near-intents-agent-api/contracts";
import {
  deriveEvmWallet,
  derivePasskeyWallet,
  evmAddressFromPublicKey,
} from "@near-intents-agent-api/owner-auth";
import { getRuntime } from "../../config/runtime.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { findCustodyWallet } from "../wallet/repository.js";
import { requireActiveWallet } from "../wallet/service.js";
import { isDeleted } from "./lifecycle-repository.js";
import { toAgentDto } from "./mapper.js";
import { type AgentRecord, findAgent, listAgentViews } from "./repository.js";

export type Agent = AgentRecord;

export async function loadAgent(actor: Actor, id: string): Promise<Agent> {
  const row = await findAgent(actor.tenantId, id);
  if (!row) throw new ApiError("agent_not_found", 404);
  return row;
}

export async function agentView(actor: Actor, agent: AgentRecord) {
  return toAgentDto(agent, await findCustodyWallet(actor.tenantId, agent.id));
}

export async function getAgentView(actor: Actor, id: string) {
  return agentView(actor, await loadAgent(actor, id));
}

/** Cursor page of this tenant's agents. `next_cursor` is echoed for the next `after`. */
export async function listAgents(
  actor: Actor,
  filter: { externalUserId?: string; after?: string } = {},
) {
  const records = await listAgentViews(actor.tenantId, {
    externalUserId: filter.externalUserId,
    after: filter.after,
    limit: 51,
  });
  const page = records.slice(0, 50);
  return {
    agents: await Promise.all(page.map((record) => agentView(actor, record))),
    next_cursor: records.length > 50 ? (page.at(-1)?.id ?? null) : null,
  };
}

/** NEP-413 recipient is the service hostname; owners sign it into every owner message. */
export function ownerMessageRecipient() {
  return new URL(getRuntime().serviceUrl).hostname;
}

export function resolveOwnerWallet(owner: OwnerWallet) {
  if (owner.type === "near")
    return { accountId: owner.accountId, publicKey: owner.publicKey, authority: "wallet" as const };
  if (getRuntime().network !== "mainnet") throw new ApiError("wallet_network_unsupported", 409);
  if (owner.type === "passkey") {
    const wallet = derivePasskeyWallet(owner.publicKey);
    return {
      accountId: wallet.accountId,
      publicKey: wallet.publicKey,
      authority: "wallet" as const,
    };
  }
  if (owner.type === "evm") {
    if (evmAddressFromPublicKey(owner.publicKey) !== owner.address)
      throw new ApiError("evm_public_key_mismatch", 409);
    const wallet = deriveEvmWallet(owner.publicKey);
    return {
      accountId: wallet.accountId,
      publicKey: wallet.publicKey,
      authority: "wallet" as const,
    };
  }
  throw new ApiError("owner_type_unsupported", 400);
}

export async function requireBoundAgent(actor: Actor, id: string) {
  return requireBoundTenantAgent(actor.tenantId, id);
}

async function requireBound(tenantId: string, id: string) {
  const agent = await findAgent(tenantId, id);
  if (!agent) throw new ApiError("agent_not_found", 404);
  if (await isDeleted(tenantId, id)) throw new ApiError("agent_deleted", 409);
  if (!agent.ownerIdentity || !agent.ownerNear || !agent.ownerAccountId || !agent.ownerPublicKey)
    throw new ApiError("agent_not_bound", 409);
  return agent;
}

/** The bound owner identity, without custody state. Readiness checks use this. */
export async function requireBoundOwnerAgent(tenantId: string, id: string) {
  return requireBound(tenantId, id);
}

/** The bound owner identity plus its active custody wallet, for anything that will write. */
export async function requireBoundTenantAgent(tenantId: string, id: string) {
  const agent = await requireBound(tenantId, id);
  const wallet = await requireActiveWallet(tenantId, id);
  return { agent, wallet };
}
