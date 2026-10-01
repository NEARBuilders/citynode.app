import { executeSchema } from "@near-intents-agent-api/contracts";
import { apiKeys, delayedExecutions, operations } from "@near-intents-agent-api/database";
import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { errorFields, logger } from "../../shared/logger.js";
import { openSecret } from "../../shared/secrets.js";
import { execute } from "./execution-service.js";
import { findOperation, persistOperationResult } from "./repository.js";

type Job = typeof delayedExecutions.$inferSelect;
const identity = (job: Job) =>
  and(
    eq(delayedExecutions.tenantId, job.tenantId),
    eq(delayedExecutions.agentId, job.agentId),
    eq(delayedExecutions.id, job.id),
  );

function decodeJob(job: Job) {
  if (!job.ciphertext || !job.nonce || !job.keyId)
    throw new ApiError("timelock_payload_missing", 409);
  return executeSchema.parse(
    JSON.parse(
      openSecret(
        { ciphertext: job.ciphertext, nonce: job.nonce, keyId: job.keyId },
        {
          schemaVersion: 1,
          tenantId: job.tenantId,
          agentId: job.agentId,
          walletId: "",
          purpose: "delayed_execution",
          operationId: job.id,
          grantId: job.grantId,
          ownerEpoch: job.ownerEpoch,
        },
      ),
    ),
  );
}

/**
 * `runOperation` claims an operation (`uncertain`) before any provider sees it, so one still
 * `pending` provably never dispatched: admission refused it after the delay, for example because
 * its grant or key expired. A claimed operation keeps the outcome `runOperation` recorded.
 */
async function persistClaimFailure(job: Job, error: unknown) {
  const operation = await findOperation(job.tenantId, job.agentId, job.id);
  if (operation?.status !== "pending") return;
  const priorResult =
    operation.result && typeof operation.result === "object" && !Array.isArray(operation.result)
      ? operation.result
      : {};
  await persistOperationResult(job.tenantId, job.agentId, job.id, "execute", "failed", {
    ...priorResult,
    status: "failed",
    failure_code: error instanceof ApiError ? error.code : "timelock_execution_failed",
  });
}

async function runClaimed(job: Job) {
  try {
    const operation = await findOperation(job.tenantId, job.agentId, job.id);
    if (!operation?.actorKeyId) throw new ApiError("invalid_api_key", 401);
    // Revoking the key that sent the request stops its queued work, even though the grant lives on.
    const [key] = await getDatabase()
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.tenantId, job.tenantId),
          eq(apiKeys.id, operation.actorKeyId),
          isNull(apiKeys.revokedAt),
          gt(apiKeys.expiresAt, sql`now()`),
        ),
      );
    if (!key) throw new ApiError("invalid_api_key", 401);
    const input = decodeJob(job);
    const actor: Actor = {
      tenantId: job.tenantId,
      keyId: key.id,
    };
    // The job resumes under the grant that admitted it, never whichever grant is newest.
    await execute(
      actor,
      job.agentId,
      input,
      { admittedGrantId: job.grantId },
      { operationId: job.id, grantId: job.grantId },
    );
  } catch (error) {
    await persistClaimFailure(job, error);
    logger.warn("timelock_execution_stopped", {
      ...errorFields(error),
      operation_id: job.id,
      code: error instanceof ApiError ? error.code : "timelock_execution_failed",
    });
  }
  await finishJob(job);
}

async function finishJob(job: Job) {
  const operation = await findOperation(job.tenantId, job.agentId, job.id);
  if (
    operation?.status === "uncertain" &&
    operation.result &&
    typeof operation.result === "object" &&
    "status" in operation.result &&
    operation.result.status === "timelocked"
  )
    await persistOperationResult(job.tenantId, job.agentId, job.id, "execute", "uncertain", {
      ...operation.result,
      status: "unknown",
      failure_code: "timelock_dispatch_uncertain",
    });
  await getDatabase()
    .update(delayedExecutions)
    .set({
      state: operation?.status === "uncertain" ? "uncertain" : "finished",
      ciphertext: null,
      nonce: null,
      keyId: null,
      updatedAt: sql`now()`,
    })
    .where(identity(job));
}

/** Durable, at-most-once dispatch: a claimed job is never automatically submitted again. */
export async function dispatchDueExecutions() {
  const database = getDatabase();
  await database.transaction(async (tx) => {
    const abandoned = await tx
      .update(delayedExecutions)
      .set({
        state: "uncertain",
        ciphertext: null,
        nonce: null,
        keyId: null,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(delayedExecutions.state, "dispatching"),
          sql`${delayedExecutions.updatedAt} < now() - interval '10 minutes'`,
        ),
      )
      .returning();
    for (const job of abandoned)
      await tx
        .update(operations)
        .set({
          status: "uncertain",
          result: sql`coalesce(${operations.result}, '{}'::jsonb) || '{"status":"unknown","failure_code":"timelock_worker_interrupted"}'::jsonb`,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(operations.tenantId, job.tenantId),
            eq(operations.agentId, job.agentId),
            eq(operations.id, job.id),
            eq(operations.status, "pending"),
          ),
        );
  });
  const due = await database
    .select()
    .from(delayedExecutions)
    .where(
      and(eq(delayedExecutions.state, "waiting"), lte(delayedExecutions.executeAfter, sql`now()`)),
    )
    .orderBy(delayedExecutions.executeAfter)
    .limit(10);
  for (const candidate of due) {
    const [claimed] = await database
      .update(delayedExecutions)
      .set({ state: "dispatching", updatedAt: sql`now()` })
      .where(
        and(
          identity(candidate),
          eq(delayedExecutions.state, "waiting"),
          lte(delayedExecutions.executeAfter, sql`now()`),
        ),
      )
      .returning();
    if (claimed) await runClaimed(claimed);
  }
  return due.length;
}
let timer: NodeJS.Timeout | undefined;
let active: Promise<void> | undefined;
let stopped = true;
export function startTimelockWorker() {
  if (!stopped) return;
  stopped = false;
  const tick = () => {
    active = dispatchDueExecutions()
      .then(
        () => {},
        (error) => logger.error("timelock_worker_failed", errorFields(error)),
      )
      .finally(() => {
        if (!stopped) {
          timer = setTimeout(tick, 1000);
          timer.unref();
        }
      });
  };
  tick();
}
export async function stopTimelockWorker() {
  stopped = true;
  clearTimeout(timer);
  await active;
}
