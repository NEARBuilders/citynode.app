import { randomUUID } from "node:crypto";
import {
  agentGrants,
  agents,
  apiKeys,
  auditEvents,
  delayedExecutions,
  operations,
  type Tx,
} from "@near-intents-agent-api/database";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { databaseClock, getDatabase } from "../../lib/db.js";
import { ApiError } from "../../shared/errors.js";

/**
 * Authorization and dispatch have to agree on a linearization point. Checking readiness, then
 * awaiting provider reads, then dispatching lets a policy tightening, owner change or lifecycle
 * change land in the gap, so an operation admitted under the old state executes under the new one.
 *
 * An operation records the epochs it was authorized under, and a delegated one the grant that
 * admitted it and the key that sent it. `lockDispatchAuthority` share-locks the agent, grant, key
 * and delayed-job rows and validates them against database time. Revocation, epoch changes and
 * timelock cancellation all update those rows, so they serialize against it: whichever
 * transaction commits first wins, and the other observes it. Grants are independent: revoking one
 * stops only the work it admitted, and issuing one stops nothing.
 *
 * - `assertDispatchFence` is that check as an early refusal between preparation steps.
 * - `commitDispatch` is the commitment point, taken immediately before a provider write. In the
 *   same transaction it stamps `dispatch_committed_at` and records a `<kind>.committed` audit
 *   event. A revocation that commits first makes it fail closed. A revocation that commits after
 *   it cannot stop the provider write, and reports the operation as committed instead.
 *
 * Anything else that must be decided against the same state joins that transaction as a
 * `beforeCommit` step, so its effects exist exactly when the commitment does. The owner's USD
 * budget is one: the caps are read under the agent lock a budget change also needs, and the charge
 * is inserted with the commitment, so no cap change can fall between the two.
 *
 * Expiry is evaluated at the commitment; an authorization that expires after it does not retract
 * the write.
 */

export type DispatchEpochs = {
  ownerEpoch: number;
  policyEpoch: number;
  lifecycleEpoch: number;
};

export async function currentEpochs(tenantId: string, agentId: string): Promise<DispatchEpochs> {
  const [agent] = await getDatabase()
    .select({
      ownerEpoch: agents.ownerEpoch,
      policyEpoch: agents.policyEpoch,
      lifecycleEpoch: agents.lifecycleEpoch,
    })
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
    .limit(1);
  if (!agent) throw new ApiError("agent_not_found", 404);
  return agent;
}

/** Rejects a direct provider write authorized under a stale epoch snapshot. */
export async function assertAuthorizationEpochsCurrent(
  tenantId: string,
  agentId: string,
  authorized: DispatchEpochs,
): Promise<void> {
  const current = await currentEpochs(tenantId, agentId);
  if (
    authorized.ownerEpoch !== current.ownerEpoch ||
    authorized.policyEpoch !== current.policyEpoch ||
    authorized.lifecycleEpoch !== current.lifecycleEpoch
  )
    throw new ApiError("authorization_stale", 409);
}

type DispatchRefusal =
  | "agent_not_found"
  | "operation_not_found"
  | "execution_timelocked"
  | "authorization_stale";

const refusalStatus: Record<DispatchRefusal, 404 | 409> = {
  agent_not_found: 404,
  operation_not_found: 404,
  execution_timelocked: 409,
  authorization_stale: 409,
};

type DispatchAuthority =
  | {
      operation: typeof operations.$inferSelect;
      agent: typeof agents.$inferSelect;
      /** Earliest delegated authority expiry, captured from the rows held locked by this transaction. */
      validUntil: Date | null;
    }
  | { refusal: DispatchRefusal };

/**
 * Locks and validates an operation's dispatch authority inside the caller's transaction. Rows are
 * locked in the order their writers take them (agent before grant, delayed job before operation).
 * Revocation predicates sit in the locking statements, so a row revoked while we wait for its lock
 * is re-evaluated and excluded. Expiry and timelock release are compared with database wall-clock
 * time read after every lock is held.
 */
export async function lockDispatchAuthority(
  tx: Tx,
  tenantId: string,
  agentId: string,
  operationId: string,
): Promise<DispatchAuthority> {
  const [agent] = await tx
    .select()
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
    .for("share");
  if (!agent) return { refusal: "agent_not_found" };
  // Abandonment is final. Its cleanup can commit between an onboarding admission's epoch read and
  // its insert, so the lifecycle itself, not only the epochs, keeps that admission from dispatching.
  if (agent.lifecycle === "abandoned") return { refusal: "authorization_stale" };
  const [delayed] = await tx
    .select({
      state: delayedExecutions.state,
      executeAfter: delayedExecutions.executeAfter,
    })
    .from(delayedExecutions)
    .where(
      and(
        eq(delayedExecutions.tenantId, tenantId),
        eq(delayedExecutions.agentId, agentId),
        eq(delayedExecutions.id, operationId),
      ),
    )
    .for("share");
  if (delayed && delayed.state !== "dispatching") return { refusal: "execution_timelocked" };
  const [operation] = await tx
    .select()
    .from(operations)
    .where(
      and(
        eq(operations.tenantId, tenantId),
        eq(operations.agentId, agentId),
        eq(operations.id, operationId),
      ),
    )
    .for("update");
  if (!operation) return { refusal: "operation_not_found" };
  if (!admittedUnder(operation, agent)) return { refusal: "authorization_stale" };
  const delegation = operation.authorizedGrantId
    ? await lockLiveDelegation(
        tx,
        tenantId,
        agentId,
        operation.actorKeyId ?? "",
        operation.authorizedGrantId,
      )
    : null;
  if (operation.authorizedGrantId && !delegation) return { refusal: "authorization_stale" };
  // Expiry and timelock release are decided once every row above is locked.
  const decidedAt = await databaseClock(tx);
  if (delayed?.executeAfter && delayed.executeAfter > decidedAt)
    return { refusal: "execution_timelocked" };
  if (delegation && delegation.expiresAt <= decidedAt) return { refusal: "authorization_stale" };
  return { operation, agent, validUntil: delegation?.expiresAt ?? null };
}

/**
 * Legacy rows have no admission authority, and a null epoch never equals a live one, so a missing
 * component is stale instead of silently inheriting live epochs.
 */
function admittedUnder(
  operation: typeof operations.$inferSelect,
  agent: typeof agents.$inferSelect,
): boolean {
  return (
    operation.authorizedOwnerEpoch === agent.ownerEpoch &&
    operation.authorizedPolicyEpoch === agent.policyEpoch &&
    operation.authorizedLifecycleEpoch === agent.lifecycleEpoch
  );
}

/**
 * Share-locks a delegation's unrevoked grant and the unrevoked key that sent it: revoking the key
 * stops work it sent, even though the grant stays usable through other keys. Returns the earlier
 * of their expiries, which the caller checks against database time.
 */
async function lockLiveDelegation(
  tx: Tx,
  tenantId: string,
  agentId: string,
  keyId: string,
  grantId: string,
): Promise<{ expiresAt: Date } | null> {
  const [key] = await tx
    .select({ expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.id, keyId), isNull(apiKeys.revokedAt)))
    .for("share");
  const [grant] = await tx
    .select({ expiresAt: agentGrants.expiresAt })
    .from(agentGrants)
    .where(
      and(
        eq(agentGrants.tenantId, tenantId),
        eq(agentGrants.agentId, agentId),
        eq(agentGrants.id, grantId),
        isNull(agentGrants.revokedAt),
      ),
    )
    .for("share");
  if (!key || !grant) return null;
  return { expiresAt: key.expiresAt < grant.expiresAt ? key.expiresAt : grant.expiresAt };
}

/** Throws a dispatch-authority refusal as its API error. */
export function refuseDispatch(refusal: DispatchRefusal): never {
  throw new ApiError(refusal, refusalStatus[refusal]);
}

/** Early refusal between preparation steps. It commits nothing; see `commitDispatch`. */
export async function assertDispatchFence(
  tenantId: string,
  agentId: string,
  operationId: string,
): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const authority = await lockDispatchAuthority(tx, tenantId, agentId, operationId);
    if ("refusal" in authority) refuseDispatch(authority.refusal);
  });
}

/**
 * Identity of one dispatch commitment. Only the attempt that won it holds this, so anything that
 * must be undone for that write, such as a refund, can be bound to it and to no other attempt.
 */
export type DispatchReceipt = Readonly<{ token: string }>;

/** Work joined to the commitment's transaction; a throw rolls the commitment back with it. */
export type BeforeCommit = (
  tx: Tx,
  context: { agent: typeof agents.$inferSelect; token: string },
) => Promise<void>;

/**
 * The commitment point, called immediately before a provider write with no await in between
 * other than the write itself. Once it returns, a later revocation cannot retract the write.
 */
export async function commitDispatch(
  tenantId: string,
  agentId: string,
  operationId: string,
  beforeCommit?: BeforeCommit,
): Promise<DispatchReceipt> {
  return getDatabase().transaction(async (tx) => {
    const authority = await lockDispatchAuthority(tx, tenantId, agentId, operationId);
    if ("refusal" in authority) refuseDispatch(authority.refusal);
    const { operation, agent, validUntil } = authority;
    // A terminal operation, for example one the maintenance sweep failed, must not dispatch.
    if (operation.status !== "pending" && operation.status !== "uncertain")
      throw new ApiError("operation_not_pending", 409);
    // An execution, signature or relay has one provider write, right after its commitment. A second
    // commitment would replay a write whose outcome is unknown, for example a stalled worker
    // resuming after recovery dispatched. Policy preparation already reached the provider before
    // its owner-signed submission commits, so its first commitment time is kept instead.
    if (operation.dispatchCommittedAt && operation.kind !== "policy")
      throw new ApiError("operation_not_pending", 409);
    const token = randomUUID();
    await beforeCommit?.(tx, { agent, token });
    // A joined step can wait for locks after lockDispatchAuthority checked expiry. Row locks
    // prevent revocation writes, not the passage of time. Refuse an expired delegation here;
    // the same transaction rolls back any budget charge already inserted by the joined step.
    const decidedAt = await databaseClock(tx);
    if (validUntil && validUntil <= decidedAt) refuseDispatch("authorization_stale");
    const stamped = await tx
      .update(operations)
      .set({
        dispatchCommittedAt: sql`coalesce(${operations.dispatchCommittedAt}, ${decidedAt})`,
        updatedAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(operations.tenantId, tenantId),
          eq(operations.agentId, agentId),
          eq(operations.id, operationId),
        ),
      )
      .returning({ id: operations.id });
    // The row is locked above, so anything but one stamped row is a broken invariant; roll back.
    if (stamped.length !== 1) throw new Error("dispatch commitment did not stamp exactly one row");
    await tx.insert(auditEvents).values({
      tenantId,
      agentId,
      action: `${operation.kind}.committed`,
      resourceId: operationId,
      actorKeyId: operation.actorKeyId,
      grantId: operation.authorizedGrantId,
      ownerEpoch: operation.authorizedOwnerEpoch,
      policyEpoch: operation.authorizedPolicyEpoch,
      lifecycleEpoch: operation.authorizedLifecycleEpoch,
      requestHash: operation.requestHash,
    });
    return { token };
  });
}

/** Bounds a revocation response; the audit log keeps every `<kind>.committed` event. */
const committedOperationReportLimit = 100;

/** Operation ids reported by a revocation; `truncated` means more exist than were listed. */
export type CommittedOperations = { ids: string[]; truncated: boolean };

/**
 * Delegated operations that committed under a key or grant and have no terminal outcome yet.
 * Revocation calls this in its own transaction after updating the revoked row. That update waited
 * for every in-flight commitment holding the row, so every operation that won the race is among
 * these rows and the revocation cannot retract it. The list holds the oldest
 * `committedOperationReportLimit` of them; `truncated` says there are more.
 */
export async function committedDelegatedOperations(
  tx: Tx,
  tenantId: string,
  by: { keyId: string } | { agentId: string; grantId: string },
): Promise<CommittedOperations> {
  const rows = await tx
    .select({ id: operations.id })
    .from(operations)
    .where(
      and(
        eq(operations.tenantId, tenantId),
        "keyId" in by
          ? eq(operations.actorKeyId, by.keyId)
          : and(eq(operations.agentId, by.agentId), eq(operations.authorizedGrantId, by.grantId)),
        isNotNull(operations.authorizedGrantId),
        isNotNull(operations.dispatchCommittedAt),
        inArray(operations.status, ["pending", "uncertain"]),
      ),
    )
    .orderBy(operations.dispatchCommittedAt, operations.id)
    .limit(committedOperationReportLimit + 1);
  return {
    ids: rows.slice(0, committedOperationReportLimit).map((row) => row.id),
    truncated: rows.length > committedOperationReportLimit,
  };
}
