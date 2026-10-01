import {
  canonical,
  type ExecutionCancellation,
  type ScheduledExecution,
  type TimelockSettings,
  type TimelockView,
  type TimelockWrite,
} from "@near-intents-agent-api/contracts";
import {
  agents,
  auditEvents,
  type Db,
  delayedExecutions,
  operations,
  type Tx,
} from "@near-intents-agent-api/database";
import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import type { CommitEffect } from "../../shared/commit-effect.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { consumeOwnerNonceInTransaction } from "../../shared/nonces.js";
import {
  assertOwnerAdminCommand,
  ownerAdminCommandChallenge,
  ownerPrincipalId,
  verifyOwnerAdminCommand,
} from "../agents/owner-admin-command.js";
import { recordOwnerReceipt } from "../agents/owner-receipts.js";
import { requireBoundAgent } from "../agents/service.js";

type ScheduledState = "waiting" | "dispatching";
const scheduledStates: ScheduledState[] = ["waiting", "dispatching"];

async function requireAgentRow(tenantId: string, agentId: string, db: Db | Tx) {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)));
  if (!agent) throw new ApiError("agent_not_found", 404);
  return agent;
}

export async function readTimelockFor(
  tenantId: string,
  agentId: string,
  db: Db | Tx = getDatabase(),
): Promise<TimelockView> {
  const agent = await requireAgentRow(tenantId, agentId, db);
  const scheduled = await db.$count(
    delayedExecutions,
    and(
      eq(delayedExecutions.tenantId, tenantId),
      eq(delayedExecutions.agentId, agentId),
      inArray(delayedExecutions.state, scheduledStates),
    ),
  );
  return {
    delay_seconds: agent.timelockDelaySeconds,
    revision: agent.timelockRevision,
    scheduled_count: scheduled,
    enforced_by: "agent_api",
  };
}
export async function readTimelock(actor: Actor, agentId: string) {
  return readTimelockFor(actor.tenantId, agentId);
}

/**
 * Release time at the millisecond precision a cursor carries, so paging neither skips nor repeats
 * executions released within the same millisecond.
 */
const releaseMs = sql`date_trunc('milliseconds', ${delayedExecutions.executeAfter})`;

/** Cursor: `<executeAfter ISO>|<id>` of the last execution returned. */
function parseScheduledCursor(cursor: string | undefined) {
  if (!cursor) return undefined;
  const [at, id] = cursor.split("|");
  const executeAfter = at ? new Date(at) : new Date(Number.NaN);
  if (!id || Number.isNaN(executeAfter.getTime())) throw new ApiError("invalid_cursor", 400);
  return { executeAfter, id };
}

/** Scheduled executions, earliest release first, one page at a time. */
export async function listScheduledExecutionsFor(
  tenantId: string,
  agentId: string,
  query: { cursor?: string; limit: number },
): Promise<{ scheduled: ScheduledExecution[]; next_cursor: string | null }> {
  const db = getDatabase();
  await requireAgentRow(tenantId, agentId, db);
  const after = parseScheduledCursor(query.cursor);
  const rows = await db
    .select({
      id: delayedExecutions.id,
      executeAfter: delayedExecutions.executeAfter,
      state: delayedExecutions.state,
      result: operations.result,
    })
    .from(delayedExecutions)
    .innerJoin(
      operations,
      and(
        eq(operations.tenantId, delayedExecutions.tenantId),
        eq(operations.agentId, delayedExecutions.agentId),
        eq(operations.id, delayedExecutions.id),
      ),
    )
    .where(
      and(
        eq(delayedExecutions.tenantId, tenantId),
        eq(delayedExecutions.agentId, agentId),
        inArray(delayedExecutions.state, scheduledStates),
        after
          ? or(
              gt(releaseMs, after.executeAfter),
              and(eq(releaseMs, after.executeAfter), gt(delayedExecutions.id, after.id)),
            )
          : undefined,
      ),
    )
    .orderBy(asc(releaseMs), asc(delayedExecutions.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    scheduled: page.map((row) => ({
      operation_id: row.id,
      execute_after: row.executeAfter.toISOString(),
      state: row.state as ScheduledState,
      action:
        row.result &&
        typeof row.result === "object" &&
        "action" in row.result &&
        typeof row.result.action === "string"
          ? row.result.action
          : null,
    })),
    next_cursor:
      rows.length > query.limit && last ? `${last.executeAfter.toISOString()}|${last.id}` : null,
  };
}
export async function listScheduledExecutions(
  actor: Actor,
  agentId: string,
  query: { cursor?: string; limit: number },
) {
  return listScheduledExecutionsFor(actor.tenantId, agentId, query);
}
function target(delay_seconds: number, expected_revision: number) {
  return hashSecret(canonical({ delay_seconds, expected_revision }));
}
export async function timelockChallenge(actor: Actor, agentId: string, settings: TimelockSettings) {
  const { agent } = await requireBoundAgent(actor, agentId);
  return {
    ...(await ownerAdminCommandChallenge(
      actor,
      agent,
      "set_timelock",
      target(settings.delay_seconds, agent.timelockRevision),
    )),
    delay_seconds: settings.delay_seconds,
    expected_revision: agent.timelockRevision,
  };
}
export async function setTimelock(
  actor: Actor,
  agentId: string,
  input: TimelockWrite,
  onCommit?: CommitEffect<Awaited<ReturnType<typeof readTimelockFor>>>,
  original?: unknown,
) {
  const { agent } = await requireBoundAgent(actor, agentId);
  const { message, proof } = input;
  assertOwnerAdminCommand(
    actor,
    agent,
    "set_timelock",
    target(message.delay_seconds, message.expected_revision),
    message,
  );
  const verification = await verifyOwnerAdminCommand(agent, message, proof);
  return getDatabase().transaction(async (tx) => {
    await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, message.nonce);
    const changed = await tx
      .update(agents)
      .set({
        timelockDelaySeconds: message.delay_seconds,
        timelockRevision: sql`${agents.timelockRevision} + 1`,
        policyEpoch: sql`${agents.policyEpoch} + 1`,
      })
      .where(
        and(
          eq(agents.tenantId, actor.tenantId),
          eq(agents.id, agentId),
          eq(agents.timelockRevision, message.expected_revision),
          eq(agents.ownerEpoch, message.owner_epoch),
        ),
      )
      .returning({ id: agents.id });
    if (!changed.length) throw new ApiError("timelock_revision_conflict", 409);
    await tx.insert(auditEvents).values({
      tenantId: actor.tenantId,
      agentId,
      resourceId: agentId,
      action: "timelock.updated",
      actorKeyId: actor.keyId,
      actorOwnerId: ownerPrincipalId(message.owner),
      requestHash: hashSecret(canonical(message)),
    });
    await recordOwnerReceipt(tx, {
      tenantId: actor.tenantId,
      agentId,
      action: "timelock_set",
      targetId: message.target_id,
      ownerEpoch: message.owner_epoch,
      message,
      proof,
      verification,
      original,
    });
    const result = await readTimelockFor(actor.tenantId, agentId, tx);
    await onCommit?.(tx, result);
    return result;
  });
}
export async function cancellationChallenge(actor: Actor, agentId: string, operationId: string) {
  const { agent } = await requireBoundAgent(actor, agentId);
  const [job] = await getDatabase()
    .select()
    .from(delayedExecutions)
    .where(
      and(
        eq(delayedExecutions.tenantId, actor.tenantId),
        eq(delayedExecutions.agentId, agentId),
        eq(delayedExecutions.id, operationId),
      ),
    );
  if (!job) throw new ApiError("operation_not_found", 404);
  if (job.state !== "waiting") throw new ApiError("execution_not_cancellable", 409);
  return ownerAdminCommandChallenge(actor, agent, "cancel_execution", operationId);
}
export async function cancelExecution(
  actor: Actor,
  agentId: string,
  operationId: string,
  input: ExecutionCancellation,
  onCommit?: CommitEffect<{ cancelled: true }>,
  original?: unknown,
) {
  const { agent } = await requireBoundAgent(actor, agentId);
  assertOwnerAdminCommand(actor, agent, "cancel_execution", operationId, input.message);
  const verification = await verifyOwnerAdminCommand(agent, input.message, input.proof);
  return getDatabase().transaction(async (tx) => {
    await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, input.message.nonce);
    const changed = await tx
      .update(delayedExecutions)
      .set({
        state: "cancelled",
        ciphertext: null,
        nonce: null,
        keyId: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(delayedExecutions.tenantId, actor.tenantId),
          eq(delayedExecutions.agentId, agentId),
          eq(delayedExecutions.id, operationId),
          eq(delayedExecutions.state, "waiting"),
        ),
      )
      .returning({ id: delayedExecutions.id });
    if (!changed.length) throw new ApiError("execution_not_cancellable", 409);
    await tx
      .update(operations)
      .set({
        status: "failed",
        result: { status: "cancelled", failure_code: "owner_cancelled" },
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(operations.tenantId, actor.tenantId),
          eq(operations.agentId, agentId),
          eq(operations.id, operationId),
        ),
      );
    await tx.insert(auditEvents).values({
      tenantId: actor.tenantId,
      agentId,
      resourceId: operationId,
      action: "execute.cancelled",
      actorKeyId: actor.keyId,
      actorOwnerId: ownerPrincipalId(input.message.owner),
      requestHash: hashSecret(canonical(input.message)),
    });
    await recordOwnerReceipt(tx, {
      tenantId: actor.tenantId,
      agentId,
      action: "execution_cancel",
      targetId: operationId,
      ownerEpoch: input.message.owner_epoch,
      message: input.message,
      proof: input.proof,
      verification,
      original,
    });
    const result = { cancelled: true as const };
    await onCommit?.(tx, result);
    return result;
  });
}
