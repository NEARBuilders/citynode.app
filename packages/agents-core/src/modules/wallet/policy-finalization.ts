import { agents, type Tx } from "@near-intents-agent-api/database";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import { ApiError } from "../../shared/errors.js";
import {
  finishPolicyOperationInTransaction,
  lockOperation,
  type OperationRecord,
} from "../operations/repository.js";
import {
  advancePolicyEpoch,
  applyPolicyRecord,
  failPolicyRecord,
  latestPolicyIdInTransaction,
  lockPolicyRecord,
} from "./repository.js";

export type PolicyOutcome =
  | { status: "applied"; transactionHash: string }
  | {
      status: "failed";
      failureCode: string;
      /** The failed write may still have changed provider state; see `advancePolicyEpoch`. */
      advanceEpoch?: boolean;
    };

type Finalization = {
  tenantId: string;
  agentId: string;
  operationId: string;
  policyId: string;
  observed: { updatedAt: Date };
  outcome: PolicyOutcome;
  result: Record<string, unknown>;
  /** Onboarding binds the owner in the same transaction as the first application. */
  bindOwner?: (tx: Tx) => Promise<boolean>;
  /** Onboarding abandons the agent in the same transaction as the failure. */
  onFailed?: (tx: Tx) => Promise<void>;
};

type Locked = {
  operation: OperationRecord;
  policy: NonNullable<Awaited<ReturnType<typeof lockPolicyRecord>>>;
};

/**
 * Settles a policy operation and its revision in one transaction.
 *
 * Observation (chain status, provider readback) happens before this, without locks. Here the
 * current state is re-read under the dispatch lock order, agent → operation → revision, and the
 * outcome is written only if the observation still describes it:
 *
 * - A terminal operation is returned as it is; nothing is written.
 * - `applied` must name the relay hash the locked operation holds and the agent's newest revision.
 *   The epoch advances only on the revision's `signed → applied` transition, so a repeated or
 *   concurrent observation never changes it twice. A revision an earlier, interrupted finalization
 *   already applied is completed without applying it again.
 * - `failed` must have been decided on the operation as it still is (same `updatedAt`); an applied
 *   revision is never failed. A failure whose write may still have changed provider state advances
 *   the epoch with it, on the same `signed → failed` transition.
 *
 * Returns null when the observation is stale; the caller re-reads the operation.
 */
export async function finalizePolicyOperation(
  input: Finalization,
): Promise<OperationRecord | null> {
  return getDatabase().transaction(async (tx) => {
    const locked = await lockSettlement(tx, input);
    if (!("policy" in locked)) return locked.operation;
    return input.outcome.status === "applied"
      ? settleApplied(tx, input, locked, input.outcome.transactionHash)
      : settleFailed(tx, input, locked, input.outcome);
  });
}

/** Agent → operation → revision. A terminal operation is returned without the revision. */
async function lockSettlement(
  tx: Tx,
  input: Finalization,
): Promise<Locked | { operation: OperationRecord }> {
  const { tenantId, agentId } = input;
  const [agent] = await tx
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
    .for("update");
  if (!agent) throw new ApiError("agent_not_found", 404);
  const operation = await lockOperation(tx, tenantId, agentId, input.operationId);
  if (!operation) throw new ApiError("operation_not_found", 404);
  if (operation.status === "completed" || operation.status === "failed") return { operation };
  const policy = await lockPolicyRecord(tx, tenantId, agentId, input.policyId);
  if (!policy) throw new ApiError("operation_not_found", 404);
  return { operation, policy };
}

async function settleApplied(
  tx: Tx,
  input: Finalization,
  { operation, policy }: Locked,
  transactionHash: string,
) {
  const { tenantId, agentId, policyId } = input;
  const held = (operation.result as { transaction_hash?: unknown } | null)?.transaction_hash;
  if (held !== transactionHash) return null;
  if ((await latestPolicyIdInTransaction(tx, tenantId, agentId)) !== policyId)
    throw new ApiError("policy_revision_conflict", 409);
  if (policy.status !== "signed" && policy.status !== "applied")
    throw new ApiError("policy_state_conflict", 409);
  if (policy.status === "signed") {
    if (input.bindOwner && !(await input.bindOwner(tx)))
      throw new ApiError("onboarding_conflict", 409);
    await applyPolicyRecord(tx, tenantId, agentId, policyId, transactionHash);
  }
  return finishPolicyOperationInTransaction(tx, operation, "completed", input.result);
}

async function settleFailed(
  tx: Tx,
  input: Finalization,
  { operation, policy }: Locked,
  outcome: Extract<PolicyOutcome, { status: "failed" }>,
) {
  if (operation.updatedAt.getTime() !== input.observed.updatedAt.getTime()) return null;
  // Applied is final: a failure decided from older evidence must not contradict it.
  if (policy.status === "applied") throw new ApiError("policy_state_conflict", 409);
  const failed = await failPolicyRecord(
    tx,
    input.tenantId,
    input.agentId,
    input.policyId,
    outcome.failureCode,
  );
  if (failed && outcome.advanceEpoch)
    await advancePolicyEpoch(tx, input.tenantId, input.agentId, policy.rules);
  await input.onFailed?.(tx);
  return finishPolicyOperationInTransaction(tx, operation, "failed", input.result);
}
