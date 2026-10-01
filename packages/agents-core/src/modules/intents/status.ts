import { setTimeout as sleep } from "node:timers/promises";
import type {
  ExecutionType,
  Status,
  StatusResponse,
  StatusType,
} from "@near-intents-agent-api/contracts/api";
import { publicCode, terminalStatuses } from "@near-intents-agent-api/contracts/api";
import { operations, ownerIntents } from "@near-intents-agent-api/database";
import { and, desc, eq, lt, ne, notExists, or } from "drizzle-orm";
import { camelRecord } from "../../api/camel.js";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { logger } from "../../shared/logger.js";
import { refreshDeletion } from "../agents/deletion-service.js";
import { getOnboarding, refreshOnboarding } from "../agents/onboarding-service.js";
import { refreshExecution } from "../operations/execution-service.js";
import {
  findOperation,
  findTenantOperation,
  type OperationRecord,
} from "../operations/repository.js";
import { projectOperationResult } from "../operations/result-projection.js";
import { reconcileOwnerPolicy } from "../wallet/owner-policy-reconciliation.js";
import { recoverApprovalVote } from "./approval-recovery.js";
import {
  executionDetails,
  executionStatus,
  isRecord,
  policyDetails,
  policyIntentTypes,
  policyStatus,
  type Record_,
  str,
} from "./outcome.js";
import {
  findOwnerIntent,
  findOwnerIntentForOperation,
  listOwnerIntents,
  type OwnerIntentRecord,
  updateOwnerIntent,
} from "./repository.js";

/**
 * One status model for every correlation id: owner intents (`owner_intents`) and the
 * operations they, executions, signatures and relays create. Reads reconcile against the chain
 * and provider first; reconciliation never submits anything.
 */

const executionActions: Record<string, ExecutionType> = {
  swap: "swap",
  withdraw: "withdraw",
  intents_transfer: "transfer",
  confidential_transfer: "transfer",
  shield: "shield",
  unshield: "unshield",
  confidential_deposit: "confidential_deposit",
  cross_chain_deposit: "deposit",
};

/** The public type of an operation that no owner intent owns. */
function operationType(operation: OperationRecord): StatusType {
  const action =
    operation.action ?? (isRecord(operation.result) ? str(operation.result.action) : null);
  if (operation.kind === "sign") return "sign_message";
  if (operation.kind === "relay") return "relay";
  if (operation.kind === "policy")
    return action === "onboarding" ? "agent_create" : "policy_update";
  if (action === "delete") return "agent_delete";
  return (action && executionActions[action]) || "swap";
}

function signingDetails(operation: OperationRecord): Record_ {
  const action = operation.action ?? "";
  return { chain: action === "sign:evm_message" ? "evm" : "near" };
}

/** Null means no outcome has been observed; it is never fabricated success data. */
function emptyIntentDetails(type: StatusType, agentId: string | null): Record_ {
  switch (type) {
    case "agent_create":
      return { agentId, revision: null, policyHash: null, transactionHash: null };
    case "policy_update":
    case "agent_freeze":
    case "agent_unfreeze":
      return { revision: null, policyHash: null, transactionHash: null };
    case "grant_issue":
      return { grant: null };
    case "grant_revoke":
      return { grantId: null, committedCorrelationIds: null, committedTruncated: null };
    case "timelock_set":
      return { timelock: null };
    case "budget_set":
      return { budget: null };
    case "execution_cancel":
      return { cancelledCorrelationId: null };
    case "agent_archive":
    case "agent_restore":
      return { archived: null };
    case "agent_delete":
      return { action: "delete" };
    case "approval_vote":
      return { approvalId: null, verdict: null };
    case "signing_artifact_ack":
      return { acknowledged: null };
    default:
      return {};
  }
}

function envelope(
  base: {
    correlationId: string;
    agentId: string | null;
    type: StatusType;
    createdAt: Date;
    updatedAt: Date;
    dispatchCommittedAt: Date | null;
    grant: { id: string; label: string } | null;
  },
  outcome: { status: Status; failureCode: string | null },
  details: Record_,
): StatusResponse {
  return {
    correlationId: base.correlationId,
    agentId: base.agentId,
    type: base.type,
    status: outcome.status,
    failureCode: outcome.failureCode,
    createdAt: base.createdAt.toISOString(),
    updatedAt: base.updatedAt.toISOString(),
    dispatchCommittedAt: base.dispatchCommittedAt?.toISOString() ?? null,
    grant: base.grant,
    details: { ...emptyIntentDetails(base.type, base.agentId), ...details },
  } as StatusResponse;
}

/** Status of an operation no intent owns: executions, signatures, relays. */
export function operationStatus(operation: OperationRecord): StatusResponse {
  const type = operationType(operation);
  const base = {
    correlationId: operation.id,
    agentId: operation.agentId,
    type,
    createdAt: operation.createdAt,
    updatedAt: operation.updatedAt,
    dispatchCommittedAt: operation.dispatchCommittedAt,
    grant:
      operation.authorizedGrantId && operation.authorizedGrantLabel
        ? { id: operation.authorizedGrantId, label: operation.authorizedGrantLabel }
        : null,
  };
  if (operation.kind === "policy")
    return envelope(base, policyStatus(operation), policyDetails(operation));
  if (operation.kind === "sign")
    return envelope(base, executionStatus(operation), signingDetails(operation));
  if (operation.kind === "relay")
    return envelope(
      base,
      executionStatus(operation),
      camelRecord(projectOperationResult("relay", operation.result)),
    );
  return envelope(base, executionStatus(operation), executionDetails(operation));
}

async function reconcileOperation(actor: Actor, operation: OperationRecord) {
  if (operation.status !== "pending" && operation.status !== "uncertain") return;
  try {
    if (operation.kind === "execute") {
      if (
        operation.action === "delete" ||
        (isRecord(operation.result) && operation.result.action === "delete")
      )
        await refreshDeletion(actor, operation.agentId, operation.id);
      else await refreshExecution(actor, operation.agentId, operation.id);
    } else if (operation.kind === "policy" && operation.action !== "onboarding")
      await reconcileOwnerPolicy(actor, operation.agentId, operation.id);
  } catch (error) {
    // A status read reports what is known; reconciliation errors never fail it.
    logger.warn("status_reconcile_failed", {
      operation_id: operation.id,
      code: error instanceof ApiError ? error.code : "unexpected",
    });
  }
}

function expired(row: OwnerIntentRecord) {
  return row.expiresAt.getTime() <= Date.now();
}

const pendingOrExpired = (row: OwnerIntentRecord) =>
  expired(row)
    ? { status: "FAILED" as const, failureCode: "intent-expired" }
    : { status: "PENDING_SIGNATURE" as const, failureCode: null };

async function onboardingStatus(actor: Actor, row: OwnerIntentRecord, reconcile: boolean) {
  const state = await (reconcile ? refreshOnboarding : getOnboarding)(actor, row.agentId).catch(
    () => null,
  );
  if (!state) return null;
  const onboarding = state.onboarding;
  const outcome: { status: Status; failureCode: string | null } =
    onboarding.status === "applied"
      ? { status: "SUCCESS", failureCode: null }
      : onboarding.status === "failed"
        ? {
            status: "FAILED",
            failureCode: onboarding.failure_code ? publicCode(onboarding.failure_code) : null,
          }
        : onboarding.status === "pending_wallet_signature"
          ? pendingOrExpired(row)
          : { status: "PROCESSING", failureCode: null };
  return {
    outcome,
    details: {
      agentId: row.agentId,
      revision: onboarding.status === "applied" ? 1 : null,
      policyHash: onboarding.policy_hash,
      transactionHash: onboarding.transaction_hash,
    },
  };
}

type Observation = {
  outcome: { status: Status; failureCode: string | null };
  details: Record_;
};

/** Outcome of a policy or deletion intent, read from the operation it created. */
async function linkedOperationStatus(
  actor: Actor,
  row: OwnerIntentRecord,
  operationId: string,
  reconcile: boolean,
): Promise<Observation | null> {
  let operation = await findOperation(actor.tenantId, row.agentId, operationId);
  if (operation && reconcile) {
    await reconcileOperation(actor, operation);
    operation = (await findOperation(actor.tenantId, row.agentId, operationId)) ?? operation;
  }
  if (!operation) return null;
  if (row.type === "agent_delete")
    return { outcome: executionStatus(operation), details: executionDetails(operation) };
  const outcome = policyStatus(operation);
  return {
    outcome:
      outcome.status === "PENDING_SIGNATURE" && row.state === "pending_signature"
        ? pendingOrExpired(row)
        : outcome,
    details: policyDetails(operation),
  };
}

async function observeIntent(
  actor: Actor,
  row: OwnerIntentRecord,
  reconcile: boolean,
): Promise<Observation> {
  if (row.type === "approval_vote" && reconcile) {
    const receipt = await recoverApprovalVote(row);
    if (receipt) return { outcome: { status: "SUCCESS", failureCode: null }, details: receipt };
  }
  const observed =
    row.type === "agent_create"
      ? await onboardingStatus(actor, row, reconcile)
      : row.operationId && (policyIntentTypes.has(row.type) || row.type === "agent_delete")
        ? await linkedOperationStatus(actor, row, row.operationId, reconcile)
        : null;
  return (
    observed ?? {
      outcome:
        row.state === "pending_signature"
          ? pendingOrExpired(row)
          : row.type === "approval_vote"
            ? { status: "UNCERTAIN", failureCode: "approval-outcome-unresolved" }
            : { status: "PROCESSING", failureCode: null },
      details: isRecord(row.result) ? row.result : {},
    }
  );
}

/** Status of one owner intent, reconciling its operation when it has one. */
export async function intentStatus(
  actor: Actor,
  row: OwnerIntentRecord,
  options: { reconcile: boolean },
): Promise<StatusResponse> {
  const type = row.type as StatusType;
  const base = {
    correlationId: row.id,
    agentId: row.agentId,
    type,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // Owner intents are signed by the owner and are not delegated work, so revocation never applies.
    dispatchCommittedAt: null,
    grant: null,
  };
  if (row.state === "completed" || row.state === "failed")
    return envelope(
      base,
      row.state === "completed"
        ? { status: "SUCCESS", failureCode: null }
        : { status: "FAILED", failureCode: row.failureCode },
      isRecord(row.result) ? row.result : {},
    );
  const observed = await observeIntent(actor, row, options.reconcile);

  // Operations are retired by history retention; keep the decided outcome on the intent.
  const decided = observed.outcome.status;
  if (decided === "SUCCESS" || decided === "FAILED" || decided === "REFUNDED") {
    await updateOwnerIntent(
      actor.tenantId,
      row.id,
      {
        state: decided === "SUCCESS" ? "completed" : "failed",
        result: observed.details,
        failureCode: observed.outcome.failureCode,
      },
      row.state,
    );
    // Answer exactly as every later read of the settled intent will.
    const settled = await findOwnerIntent(actor.tenantId, row.id);
    if (settled) return intentStatus(actor, settled, options);
  }
  return envelope(base, observed.outcome, observed.details);
}

const uuidPattern = /^[0-9a-f]{8}-/;

async function statusOnce(actor: Actor, correlationId: string, reconcile: boolean) {
  if (uuidPattern.test(correlationId)) {
    const row = await findOwnerIntent(actor.tenantId, correlationId);
    if (!row) throw new ApiError("status_not_found", 404);
    return intentStatus(actor, row, { reconcile });
  }
  const operation = await findTenantOperation(actor.tenantId, correlationId);
  if (!operation) throw new ApiError("status_not_found", 404);
  const owner = await findOwnerIntentForOperation(actor.tenantId, operation.agentId, operation.id);
  if (owner) return intentStatus(actor, owner, { reconcile });
  if (reconcile) {
    await reconcileOperation(actor, operation);
    const current = await findOperation(actor.tenantId, operation.agentId, operation.id);
    return operationStatus(current ?? operation);
  }
  return operationStatus(operation);
}

const pollIntervalMs = 1_000;

/**
 * Status of any correlation id. `waitMs` long-polls until the status is terminal, needs the
 * owner's signature, or the wait ends.
 */
export async function readStatus(actor: Actor, correlationId: string, waitMs = 0) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const status = await statusOnce(actor, correlationId, true);
    if (
      terminalStatuses.includes(status.status) ||
      status.status === "PENDING_SIGNATURE" ||
      Date.now() + pollIntervalMs > deadline
    )
      return status;
    await sleep(pollIntervalMs);
  }
}

/** Cursor: `<createdAt ISO>|<id>` of the last entry returned. */
function parseCursor(cursor: string | undefined) {
  if (!cursor) return undefined;
  const [at, id] = cursor.split("|");
  const createdAt = at ? new Date(at) : new Date(Number.NaN);
  if (!id || Number.isNaN(createdAt.getTime())) throw new ApiError("invalid_cursor", 400);
  return { createdAt, id };
}

/**
 * Newest-first history of an agent: its owner intents and every operation no intent owns.
 * Entries are read as stored, without reconciliation.
 */
export async function readHistory(
  actor: Actor,
  agentId: string,
  query: { cursor?: string; limit: number },
) {
  const before = parseCursor(query.cursor);
  const [intents, operationRows] = await Promise.all([
    listOwnerIntents(actor.tenantId, agentId, query.limit + 1, before),
    getDatabase()
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.tenantId, actor.tenantId),
          eq(operations.agentId, agentId),
          // Policy and onboarding operations surface through the intent that created them.
          ne(operations.kind, "policy"),
          before
            ? or(
                lt(operations.createdAt, before.createdAt),
                and(eq(operations.createdAt, before.createdAt), lt(operations.id, before.id)),
              )
            : undefined,
          notExists(
            getDatabase()
              .select({ id: ownerIntents.id })
              .from(ownerIntents)
              .where(
                and(
                  eq(ownerIntents.tenantId, operations.tenantId),
                  eq(ownerIntents.agentId, operations.agentId),
                  eq(ownerIntents.operationId, operations.id),
                ),
              ),
          ),
        ),
      )
      .orderBy(desc(operations.createdAt), desc(operations.id))
      .limit(query.limit + 1),
  ]);
  const merged = [
    ...intents.map((row) => ({ createdAt: row.createdAt, id: row.id, intent: row })),
    ...operationRows.map((row) => ({ createdAt: row.createdAt, id: row.id, operation: row })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
  const page = merged.slice(0, query.limit);
  const data = await Promise.all(
    page.map((entry) =>
      "intent" in entry && entry.intent
        ? intentStatus(actor, entry.intent, { reconcile: false })
        : operationStatus((entry as { operation: OperationRecord }).operation),
    ),
  );
  const last = page.at(-1);
  return {
    data,
    nextCursor:
      merged.length > query.limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}
