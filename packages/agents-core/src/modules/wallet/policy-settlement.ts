import { agents, operations } from "@near-intents-agent-api/database";
import { and, eq, inArray, isNull, lt, notExists, sql } from "drizzle-orm";
import { databaseClock, getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import { errorFields, logger } from "../../shared/logger.js";
import { refreshOnboarding } from "../agents/onboarding-service.js";
import { abandonAgentInTransaction } from "../agents/repository.js";
import {
  finishPolicyOperationInTransaction,
  lockOperation,
  type OperationRecord,
} from "../operations/repository.js";
import { reconcileOwnerPolicy } from "./owner-policy-reconciliation.js";

/**
 * Policy settlement: no policy operation depends on a client refreshing it.
 *
 * Reconciliation is observation only and finalization re-checks everything under its locks, so
 * running this beside client refreshes, or in several processes at once, is safe. Candidates are
 * sampled at random, so a few that stay undecided can never starve the rest. Settling promptly
 * also keeps a dropped transaction inside the window in which its nonce can prove the drop.
 */
const settlementBatchSize = 50;

/** Settlement acts for the tenant that owns the operation; it signs and admits nothing. */
const settlementActor = (tenantId: string): Actor => ({ tenantId, keyId: "policy-settlement" });

/** Open policy operations of agents that can still become or stay live, settled if decided. */
export async function sweepUnsettledPolicies(): Promise<number> {
  const candidates = await getDatabase()
    .select({
      tenantId: operations.tenantId,
      agentId: operations.agentId,
      id: operations.id,
      status: operations.status,
      result: operations.result,
      updatedAt: operations.updatedAt,
      lifecycle: agents.lifecycle,
    })
    .from(operations)
    .innerJoin(
      agents,
      and(eq(agents.tenantId, operations.tenantId), eq(agents.id, operations.agentId)),
    )
    .where(
      and(
        eq(operations.kind, "policy"),
        inArray(operations.status, ["pending", "uncertain"]),
        inArray(agents.lifecycle, ["pending", "active", "archived"]),
        lt(operations.updatedAt, sql`now() - interval '2 minutes'`),
      ),
    )
    .orderBy(sql`random()`)
    .limit(settlementBatchSize);
  let settled = 0;
  for (const candidate of candidates) {
    try {
      if (await settle(candidate)) settled += 1;
    } catch (error) {
      logger.warn("policy_settlement_failed", {
        operation_id: candidate.id,
        ...errorFields(error),
      });
    }
  }
  return settled;
}

type Candidate = {
  tenantId: string;
  agentId: string;
  id: string;
  status: string;
  result: unknown;
  updatedAt: Date;
  lifecycle: string;
};

async function settle(candidate: Candidate) {
  const actor = settlementActor(candidate.tenantId);
  const result = (candidate.result ?? {}) as { policy_id?: unknown; onboarding?: unknown };
  if (typeof result.policy_id !== "string") return failInterruptedPreparation(candidate);
  if (result.onboarding === true) {
    const { onboarding } = await refreshOnboarding(actor, candidate.agentId);
    return onboarding.status === "applied" || onboarding.status === "failed";
  }
  const operation = await reconcileOwnerPolicy(actor, candidate.agentId, candidate.id);
  return operation.status === "completed" || operation.status === "failed";
}

const idleHourMs = 60 * 60_000;

/**
 * A claimed preparation that never stored its preparation stopped before any request existed for
 * its owner to sign, so nothing it did can reach the chain. After the idle hour that live
 * preparation work leaves room for, it fails; a revision it may have stored is released by the
 * next preparation, and an agent it was onboarding is abandoned.
 *
 * The candidate was sampled without locks, so the decision is made again under the dispatch lock
 * order, agent → operation, against the operation as it is now. A worker that resumed and stored
 * its preparation, or any other write since the sample, makes this a no-op: cleanup never asserts
 * an outcome the operation's own state machine would refuse.
 */
async function failInterruptedPreparation(candidate: Candidate) {
  const { tenantId, agentId, id } = candidate;
  return getDatabase().transaction(async (tx) => {
    const [agent] = await tx
      .select({ lifecycle: agents.lifecycle })
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
      .for("update");
    if (!agent) return false;
    const operation = await lockOperation(tx, tenantId, agentId, id);
    if (!operation || !stillInterrupted(operation, candidate, await databaseClock(tx)))
      return false;
    await finishPolicyOperationInTransaction(tx, operation, "failed", {
      status: "failed",
      failure_code: "preparation_interrupted",
    });
    if (agent.lifecycle === "pending")
      await abandonAgentInTransaction(tx, tenantId, agentId, "onboarding_preparation_failed");
    return true;
  });
}

/** Unchanged since sampled, idle for the hour, and holding no preparation or dispatch evidence. */
function stillInterrupted(operation: OperationRecord, observed: Candidate, now: Date) {
  const result = (operation.result ?? {}) as Record<string, unknown>;
  return (
    operation.kind === "policy" &&
    operation.status === "uncertain" &&
    operation.updatedAt.getTime() === observed.updatedAt.getTime() &&
    operation.updatedAt.getTime() < now.getTime() - idleHourMs &&
    typeof result.policy_id !== "string" &&
    typeof result.transaction_hash !== "string" &&
    result.storage_funding === undefined
  );
}

/**
 * An agent whose creation stopped before its onboarding operation was admitted has no request its
 * owner could sign and never becomes live, so it is abandoned after the idle hour.
 */
export async function sweepUnstartedOnboardings(): Promise<number> {
  const stale = await getDatabase()
    .select({ tenantId: agents.tenantId, id: agents.id })
    .from(agents)
    .where(and(unstartedOnboarding(), notExists(onboardingOperation())))
    .limit(settlementBatchSize);
  let abandoned = 0;
  for (const agent of stale)
    if (await abandonUnstartedOnboarding(agent.tenantId, agent.id)) abandoned += 1;
  return abandoned;
}

/**
 * Admission inserts its operation under a key-share lock on the agent row (the foreign key), so
 * once this holds the row, an admission that committed first is visible to the recheck below, and
 * one that commits after meets an abandoned agent at its dispatch fence, before any provider call.
 */
async function abandonUnstartedOnboarding(tenantId: string, agentId: string) {
  return getDatabase().transaction(async (tx) => {
    const [agent] = await tx
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId), unstartedOnboarding()))
      .for("update");
    if (!agent) return false;
    const [admitted] = await tx
      .select({ id: operations.id })
      .from(operations)
      .where(
        and(
          eq(operations.tenantId, tenantId),
          eq(operations.agentId, agentId),
          eq(operations.kind, "policy"),
        ),
      )
      .limit(1);
    if (admitted) return false;
    return abandonAgentInTransaction(tx, tenantId, agentId, "onboarding_preparation_failed");
  });
}

const unstartedOnboarding = () =>
  and(
    eq(agents.lifecycle, "pending"),
    isNull(agents.ownerAccountId),
    lt(agents.createdAt, sql`now() - interval '1 hour'`),
  );

const onboardingOperation = () =>
  getDatabase()
    .select({ id: operations.id })
    .from(operations)
    .where(
      and(
        eq(operations.tenantId, agents.tenantId),
        eq(operations.agentId, agents.id),
        eq(operations.kind, "policy"),
      ),
    );
