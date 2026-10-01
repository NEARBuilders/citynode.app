import type { OwnerNear, OwnerWallet } from "@near-intents-agent-api/contracts";
import {
  type AgentLifecycle,
  agents,
  auditEvents,
  type Tx,
  tenants,
} from "@near-intents-agent-api/database";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";

export type AgentRecord = typeof agents.$inferSelect;

/** Repositories cannot map HTTP errors (see architecture.test.ts); the caller translates this. */
export class AgentQuotaExceededError extends Error {
  constructor(
    code: "agent_quota_exceeded" | "agent_creation_quota_exceeded" = "agent_quota_exceeded",
  ) {
    super(code);
  }
}

export async function findAgent(tenantId: string, id: string) {
  return (
    await getDatabase()
      .select()
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.id, id)))
  )[0];
}

/**
 * Cursor page over one tenant's agents, newest first. The cursor is the last id of the previous
 * page. `(created_at, id)` is compared as a row value so agents created in the same millisecond
 * are neither skipped nor repeated. A caller that pages through every agent is no longer
 * silently truncated at the old fixed limit of 100.
 */
export async function listAgentViews(
  tenantId: string,
  filter: { externalUserId?: string; after?: string; limit?: number } = {},
) {
  const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
  const cursor = filter.after
    ? sql`(${agents.createdAt}, ${agents.id}) < (
        select cursor.created_at, cursor.id from ${agents} cursor
        where cursor.tenant_id = ${tenantId} and cursor.id = ${filter.after}
      )`
    : undefined;
  return getDatabase()
    .select()
    .from(agents)
    .where(
      and(
        eq(agents.tenantId, tenantId),
        filter.externalUserId ? eq(agents.externalUserId, filter.externalUserId) : undefined,
        cursor,
      ),
    )
    .orderBy(desc(agents.createdAt), desc(agents.id))
    .limit(limit);
}

/**
 * Lifecycles that still hold a provider custody wallet: a `pending` agent's wallet is provisioned
 * before the owner signs, and archiving does not deprovision. Deletion releases the wallet.
 * `abandoned` agents are not counted so a failed onboarding does not consume usable capacity; their
 * wallets are never deprovisioned, so this bounds live agents, not wallets ever created.
 */
const countableAgentLifecycles: AgentLifecycle[] = ["pending", "active", "archived"];

export async function insertAgent(
  input: {
    id: string;
    tenantId: string;
    name: string;
    externalUserId: string | null;
  },
  limit: number,
  creationLimit?: number,
) {
  await getDatabase().transaction(async (tx) => {
    // Locking the tenant row serializes concurrent agent creation for this tenant, so two
    // requests that both read the count as under the cap cannot both insert and overshoot it.
    // The lock (and the whole check) happens before any provider call: `createAgent` in
    // onboarding-service.ts only provisions the custody wallet after this transaction commits, so
    // an over-quota request never reaches the provider and this lock never spans that call.
    const [tenant] = await tx
      .select({ id: tenants.id, profile: tenants.quotaProfile })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .for("update");
    if (!tenant) throw new Error("insertAgent: tenant not found");
    limit = tenant.profile.liveAgents ?? limit;
    creationLimit = tenant.profile.lifetimeAgents ?? creationLimit;
    // A failed onboarding or deletion frees live capacity, but must not reset a lifetime
    // creation budget. Count every retained admission, even if provider registration failed.
    if (creationLimit !== undefined) {
      const [created] = await tx
        .select({ total: count() })
        .from(agents)
        .where(eq(agents.tenantId, input.tenantId));
      if ((created?.total ?? 0) >= creationLimit)
        throw new AgentQuotaExceededError("agent_creation_quota_exceeded");
    }
    const [row] = await tx
      .select({ total: count() })
      .from(agents)
      .where(
        and(
          eq(agents.tenantId, input.tenantId),
          inArray(agents.lifecycle, countableAgentLifecycles),
        ),
      );
    if ((row?.total ?? 0) >= limit) throw new AgentQuotaExceededError();
    await tx.insert(agents).values(input);
  });
}

/** Provenance attached to a lifecycle or authorization event, for independent reconstruction. */
export type AuditProvenance = Partial<{
  actorKeyId: string;
  grantId: string;
  ownerEpoch: number;
  policyEpoch: number;
  lifecycleEpoch: number;
  requestHash: string;
  providerReference: string;
}>;

/**
 * The only way an agent gains an owner: its onboarding transaction finalized and the provider
 * confirmed the policy. Runs inside the policy finalization transaction, so owner binding, first
 * policy and activation commit together, and only for a still-pending agent, so a replay cannot
 * rebind or reactivate anything.
 */
export async function bindOnboardingOwner(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    ownerAccountId: string;
    ownerPublicKey: string;
    ownerIdentity: OwnerWallet;
    ownerNear: OwnerNear;
  },
): Promise<boolean> {
  const updated = await tx
    .update(agents)
    .set({
      ownerAccountId: input.ownerAccountId,
      ownerPublicKey: input.ownerPublicKey,
      ownerIdentity: input.ownerIdentity,
      ownerNear: input.ownerNear,
      lifecycle: "active",
    })
    .where(
      and(
        eq(agents.tenantId, input.tenantId),
        eq(agents.id, input.id),
        eq(agents.lifecycle, "pending"),
        isNull(agents.ownerAccountId),
      ),
    )
    .returning({ id: agents.id });
  if (!updated.length) return false;
  await tx.insert(auditEvents).values({
    tenantId: input.tenantId,
    agentId: input.id,
    action: "owner.bound",
    resourceId: input.ownerAccountId,
  });
  return true;
}

/** A pending agent whose onboarding expired or failed never becomes usable. */
export async function abandonAgent(tenantId: string, id: string, reason: string) {
  await getDatabase().transaction((tx) => abandonAgentInTransaction(tx, tenantId, id, reason));
}

/** Returns whether this call abandoned the agent; one already past `pending` is left alone. */
export async function abandonAgentInTransaction(
  tx: Tx,
  tenantId: string,
  id: string,
  reason: string,
): Promise<boolean> {
  const updated = await tx
    .update(agents)
    .set({ lifecycle: "abandoned" })
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, id), eq(agents.lifecycle, "pending")))
    .returning({ id: agents.id });
  if (!updated.length) return false;
  await tx
    .insert(auditEvents)
    .values({ tenantId, agentId: id, action: "agent.abandoned", resourceId: reason });
  return true;
}

/** Columns written from provenance. Kept in one place so no caller records a partial record. */
export function auditProvenance(provenance: AuditProvenance | undefined) {
  if (!provenance) return {};
  return {
    actorKeyId: provenance.actorKeyId ?? null,
    grantId: provenance.grantId ?? null,
    ownerEpoch: provenance.ownerEpoch ?? null,
    policyEpoch: provenance.policyEpoch ?? null,
    lifecycleEpoch: provenance.lifecycleEpoch ?? null,
    requestHash: provenance.requestHash ?? null,
    providerReference: provenance.providerReference ?? null,
  };
}

export async function advanceOwnerCounter(input: {
  tenantId: string;
  id: string;
  ownerIdentity: OwnerWallet;
  previousCounter: number;
  counter: number;
}): Promise<boolean> {
  const updated = await getDatabase()
    .update(agents)
    .set({ ownerCounter: input.counter })
    .where(
      and(
        eq(agents.tenantId, input.tenantId),
        eq(agents.id, input.id),
        eq(agents.ownerCounter, input.previousCounter),
        eq(agents.ownerIdentity, input.ownerIdentity),
      ),
    )
    .returning({ id: agents.id });
  return updated.length > 0;
}
