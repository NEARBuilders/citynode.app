import {
  auditRetentionHolds,
  delayedExecutions,
  operationArtifacts,
  operations,
  operationTombstones,
  ownerIntents,
  type Tx,
} from "@near-intents-agent-api/database";
import { and, eq, exists, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import type { OperationRecord } from "../operations/repository.js";
import { terminalIntentOutcome } from "./outcome.js";
import type { OwnerIntentRecord } from "./repository.js";

const retentionDays = 90;
const batchSize = 500;

/**
 * Retires terminal operation detail once a permanent idempotency tombstone exists and no live
 * reference needs it.
 *
 * An owner intent takes its outcome from its operation on a status read, and nothing guarantees a
 * client ever reads it. So in the transaction that deletes an operation, every intent still
 * waiting on it first takes the operation's terminal outcome; an operation with a waiting intent
 * whose outcome cannot be derived from it is kept. A retired correlation id answers as it would
 * have before, whether or not anyone polled it.
 */
export async function sweepTerminalOperations(): Promise<number> {
  return getDatabase().transaction(async (tx) => {
    const candidates = await lockRetirableOperations(tx);
    if (!candidates.length) return 0;
    // Operation → intent, the order in which a submission links an intent to its operation.
    const waiting = await tx
      .select()
      .from(ownerIntents)
      .where(
        and(
          inArray(
            ownerIntents.operationId,
            candidates.map((operation) => operation.id),
          ),
          inArray(ownerIntents.state, ["pending_signature", "submitted"]),
        ),
      )
      .for("update");
    const retired: OperationRecord[] = [];
    for (const operation of candidates)
      if (await settleWaitingIntents(tx, operation, waiting)) retired.push(operation);
    if (!retired.length) return 0;
    const removed = await tx
      .delete(operations)
      .where(or(...retired.map(operationIdentity)))
      .returning({ id: operations.id });
    return removed.length;
  });
}

/** Writes each waiting intent's terminal outcome; false, writing nothing, if one has none. */
async function settleWaitingIntents(
  tx: Tx,
  operation: OperationRecord,
  waiting: OwnerIntentRecord[],
): Promise<boolean> {
  const settled = waiting
    .filter(
      (intent) =>
        intent.tenantId === operation.tenantId &&
        intent.agentId === operation.agentId &&
        intent.operationId === operation.id,
    )
    .map((intent) => ({ intent, outcome: terminalIntentOutcome(intent, operation) }));
  if (settled.some(({ outcome }) => !outcome)) return false;
  for (const { intent, outcome } of settled)
    await tx
      .update(ownerIntents)
      .set({ ...outcome, updatedAt: sql`now()` })
      .where(and(eq(ownerIntents.tenantId, intent.tenantId), eq(ownerIntents.id, intent.id)));
  return true;
}

function lockRetirableOperations(tx: Tx) {
  const sameOperation = <T extends typeof delayedExecutions | typeof operationTombstones>(
    table: T,
  ) =>
    and(
      eq(table.tenantId, operations.tenantId),
      eq(table.agentId, operations.agentId),
      eq(table.id, operations.id),
    );
  return tx
    .select()
    .from(operations)
    .where(
      and(
        inArray(operations.status, ["completed", "failed"]),
        lt(operations.updatedAt, sql`now() - ${retentionDays} * interval '1 day'`),
        exists(
          tx
            .select({ id: operationTombstones.id })
            .from(operationTombstones)
            .where(sameOperation(operationTombstones)),
        ),
        notExists(
          tx
            .select({ id: delayedExecutions.id })
            .from(delayedExecutions)
            .where(sameOperation(delayedExecutions)),
        ),
        notExists(
          tx
            .select({ id: operationArtifacts.operationId })
            .from(operationArtifacts)
            .where(
              and(
                eq(operationArtifacts.tenantId, operations.tenantId),
                eq(operationArtifacts.agentId, operations.agentId),
                eq(operationArtifacts.operationId, operations.id),
              ),
            ),
        ),
        notExists(
          tx
            .select({ id: auditRetentionHolds.id })
            .from(auditRetentionHolds)
            .where(
              and(
                eq(auditRetentionHolds.tenantId, operations.tenantId),
                isNull(auditRetentionHolds.releasedAt),
                or(
                  isNull(auditRetentionHolds.agentId),
                  eq(auditRetentionHolds.agentId, operations.agentId),
                ),
              ),
            ),
        ),
      ),
    )
    .orderBy(operations.updatedAt)
    .limit(batchSize)
    .for("update", { of: operations, skipLocked: true });
}

const operationIdentity = (operation: OperationRecord) =>
  and(
    eq(operations.tenantId, operation.tenantId),
    eq(operations.agentId, operation.agentId),
    eq(operations.id, operation.id),
  );
