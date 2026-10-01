import {
  type LimitsView,
  type PolicyHistory,
  type PolicyView,
  policySchema,
} from "@near-intents-agent-api/contracts";
import { getOutlayer } from "../../lib/outlayer.js";
import type { Actor } from "../../shared/actor.js";
import { nearPolicyOwnerMatches } from "../../shared/near.js";
import { requireBoundAgent, requireBoundTenantAgent } from "../agents/service.js";
import { custodyCredential } from "../wallet/service.js";
import { matchesProviderPolicy } from "./policy-readiness.js";
import { latestPolicy, listPolicyVersions } from "./repository.js";

/** Exact provider rules and local application status; no fabricated local counters. */
export async function readPolicyFor(tenantId: string, agentId: string): Promise<PolicyView> {
  const { agent, wallet } = await requireBoundTenantAgent(tenantId, agentId);
  const record = await latestPolicy(tenantId, agentId);
  const policy = record ? policySchema.parse(record.rules) : null;
  const provider =
    record?.status === "applied" ? await getOutlayer().policy(custodyCredential(wallet)) : null;
  const synced =
    provider !== null &&
    (await nearPolicyOwnerMatches({
      contractId: getOutlayer().contractId,
      nearAccountId: wallet.nearAccountId,
      expectedOwner: agent.ownerAccountId,
      freshness: "cached",
    })) &&
    record?.status === "applied" &&
    record.failureReason === null &&
    policy !== null &&
    matchesProviderPolicy(provider, wallet.providerWalletId, policy);
  return {
    wallet_id: wallet.providerWalletId,
    policy_hash: record?.policyHash ?? null,
    revision: record?.version ?? null,
    status: record?.status ?? "none",
    applied_at: record?.appliedAt?.toISOString() ?? null,
    transaction_hash: record?.transactionHash ?? null,
    provider_policy_synced: synced,
    policy,
  };
}

export async function readLimitsFor(tenantId: string, agentId: string): Promise<LimitsView> {
  const view = await readPolicyFor(tenantId, agentId);
  const policy = view.policy;
  return {
    wallet_id: view.wallet_id,
    frozen: policy?.frozen ?? null,
    capabilities: policy?.capabilities ?? null,
    limits: policy?.rules.limits ?? null,
    rate_limit: policy?.rules.rate_limit ?? null,
    addresses: policy?.rules.addresses ?? null,
    allowed_tokens: policy?.rules.allowed_tokens ?? null,
    transaction_types: policy?.rules.transaction_types ?? null,
    approval: policy?.approval ?? null,
    policy_synced: view.provider_policy_synced,
  };
}

export async function readPolicy(actor: Actor, agentId: string): Promise<PolicyView> {
  return readPolicyFor(actor.tenantId, agentId);
}

export async function readLimits(actor: Actor, agentId: string): Promise<LimitsView> {
  return readLimitsFor(actor.tenantId, agentId);
}

export async function readPolicyHistory(
  actor: Actor,
  agentId: string,
  query: { limit: number; beforeRevision?: number },
): Promise<PolicyHistory> {
  await requireBoundAgent(actor, agentId);
  const rows = await listPolicyVersions(
    actor.tenantId,
    agentId,
    query.limit + 1,
    query.beforeRevision,
  );
  const page = rows.slice(0, query.limit);
  return {
    policies: page.map((record) => ({
      wallet_id: record.walletId,
      policy_hash: record.policyHash,
      revision: record.version,
      status: record.status,
      applied_at: record.appliedAt?.toISOString() ?? null,
      transaction_hash: record.transactionHash,
      policy: policySchema.parse(record.rules),
    })),
    next_before_revision: rows.length > query.limit ? (page.at(-1)?.version ?? null) : null,
  };
}
