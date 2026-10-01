import type { Status } from "@near-intents-agent-api/contracts/api";
import { publicCode } from "@near-intents-agent-api/contracts/api";
import { camelRecord } from "../../api/camel.js";
import type { OperationRecord } from "../operations/repository.js";
import { projectOperationResult } from "../operations/result-projection.js";

/**
 * Pure outcome projections of an operation. Status reads and history retention both use them, so
 * an intent settled from its operation reads the same whichever of them settled it.
 */

export type Record_ = Record<string, unknown>;
export type Outcome = { status: Status; failureCode: string | null };

export const isRecord = (value: unknown): value is Record_ =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const str = (value: unknown) => (typeof value === "string" ? value : null);

export const policyIntentTypes = new Set(["policy_update", "agent_freeze", "agent_unfreeze"]);

export function failureCodeOf(result: unknown): string | null {
  if (!isRecord(result)) return null;
  const code = str(result.failure_code);
  return code ? publicCode(code) : null;
}

/** Execution lifecycle, from the operation status and the provider status it recorded. */
export function executionStatus(operation: OperationRecord): Outcome {
  const result = isRecord(operation.result) ? operation.result : {};
  const provider = str(result.status);
  switch (operation.status) {
    case "completed":
      return { status: "SUCCESS", failureCode: null };
    case "failed":
      return {
        status: provider === "refunded" ? "REFUNDED" : "FAILED",
        failureCode: failureCodeOf(result) ?? (provider ? publicCode(provider) : null),
      };
    case "uncertain":
      return { status: "UNCERTAIN", failureCode: failureCodeOf(result) };
    case "pending":
      if (provider === "timelocked") return { status: "QUEUED", failureCode: null };
      if (provider === "pending_approval") return { status: "PENDING_APPROVAL", failureCode: null };
      if (provider === "pending_deposit") return { status: "PENDING_DEPOSIT", failureCode: null };
      return { status: "PROCESSING", failureCode: null };
  }
}

export function executionDetails(operation: OperationRecord): Record_ {
  const projected = camelRecord(projectOperationResult(operation.kind, operation.result));
  const { status: providerStatus, failureCode: _failure, ...rest } = projected;
  return {
    ...rest,
    action: str(rest.action) ?? operation.action ?? "unknown",
    ...(typeof providerStatus === "string" ? { providerStatus } : {}),
  };
}

export function policyDetails(operation: OperationRecord | undefined): Record_ {
  const result = isRecord(operation?.result) ? operation.result : {};
  const expected = typeof result.expected_revision === "number" ? result.expected_revision : null;
  return {
    revision: operation?.status === "completed" && expected !== null ? expected + 1 : null,
    policyHash: str(result.policy_hash),
    transactionHash: str(result.transaction_hash),
  };
}

export function policyStatus(operation: OperationRecord): Outcome {
  const result = isRecord(operation.result) ? operation.result : {};
  if (operation.status === "completed") return { status: "SUCCESS", failureCode: null };
  if (operation.status === "failed")
    return { status: "FAILED", failureCode: failureCodeOf(result) };
  if (operation.status === "pending" && result.status === "pending_wallet_signature")
    return { status: "PENDING_SIGNATURE", failureCode: null };
  return { status: "PROCESSING", failureCode: null };
}

/**
 * The terminal state an owner intent takes from its terminal operation, or null when the operation
 * is not terminal or the intent type does not take its outcome from an operation.
 */
export function terminalIntentOutcome(
  intent: { type: string; agentId: string },
  operation: OperationRecord,
): { state: "completed" | "failed"; result: Record_; failureCode: string | null } | null {
  if (operation.status !== "completed" && operation.status !== "failed") return null;
  const result = isRecord(operation.result) ? operation.result : {};
  let outcome: Outcome;
  let details: Record_;
  if (intent.type === "agent_create") {
    const applied = operation.status === "completed";
    outcome = applied
      ? { status: "SUCCESS", failureCode: null }
      : { status: "FAILED", failureCode: failureCodeOf(result) };
    details = {
      agentId: intent.agentId,
      revision: applied ? 1 : null,
      policyHash: str(result.policy_hash),
      transactionHash: str(result.transaction_hash),
    };
  } else if (policyIntentTypes.has(intent.type)) {
    outcome = policyStatus(operation);
    details = policyDetails(operation);
  } else if (intent.type === "agent_delete") {
    outcome = executionStatus(operation);
    details = executionDetails(operation);
  } else return null;
  return {
    state: outcome.status === "SUCCESS" ? "completed" : "failed",
    result: details,
    failureCode: outcome.failureCode,
  };
}
