import {
  type OperationKind,
  type OperationStatus,
  operationStatusSchema,
} from "@near-intents-agent-api/contracts";
import { readRecord } from "./provider-result.js";

/**
 * Errors that provably mean no provider write happened. A refusal decided before broadcast is
 * recorded as failed rather than uncertain. Operation admission adds route-specific failures
 * only where their origin proves no provider write happened.
 */
export const preBroadcastRefusalCodes = [
  "policy_denied",
  "authorization_stale",
  "agent_archived",
  "agent_paused",
  "provider_policy_mismatch",
  "policy_not_ready",
] as const;

export function isPreBroadcastRefusalCode(code: string | undefined): boolean {
  return code !== undefined && (preBroadcastRefusalCodes as readonly string[]).includes(code);
}

/**
 * Provider refusals OutLayer decides before it admits, signs or submits anything: its policy
 * engine, the balance check, a frozen wallet, a custody account that cannot prepay gas, and
 * `wallet_busy`. OutLayer runs one money operation per custody wallet and takes that per-wallet
 * lock before its idempotency check, so an overlapping request is refused without a request row.
 * A transaction that did broadcast and then reverted comes back as `onchain_tx_failed`, never as
 * one of these.
 *
 * The refusal proves nothing about an earlier attempt: when the transport had already resent
 * the request, the refusal can be caused by that attempt, for example `wallet_busy` while it still
 * holds the wallet. Only an answer to the first send classifies the operation as never executed.
 */
const providerPreBroadcastRefusalCodes = new Set([
  "policy_denied",
  // OutLayer's 400 validation refusals: the request was never admitted.
  "invalid_request",
  "amount_too_low",
  "route_unavailable",
  "invalid_address",
  "unsupported_chain",
  "unsupported_token",
  "insufficient_balance",
  "wallet_frozen",
  "custody_native_balance_required",
  "wallet_busy",
]);

export function isProviderPreBroadcastRefusal(error: {
  code: string;
  status?: number;
  resent?: boolean;
}): boolean {
  const status = error.status ?? 0;
  return (
    !error.resent &&
    providerPreBroadcastRefusalCodes.has(error.code) &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

/**
 * The classifier separates the provider's claim from what the evidence proves. It is the only
 * place that decides an operation's lifecycle status:
 *
 * A transaction hash is an identifier, not proof of settlement. A missing status with a hash, an
 * empty evidence array, or a pending settlement field must never become `completed`.
 */

const withdrawEvidence = [
  "tx_hash",
  "settlement_tx_hash",
  "destination_tx_hash",
  "receipt_hash",
] as const;

/** Settlement evidence that actually demonstrates funds movement for its action. */
const settlementEvidence: Record<string, readonly string[]> = {
  swap: ["settlement_tx_hash", "destination_tx_hash", "receipt_hash"],
  withdraw: withdrawEvidence,
  // Confidential routes settle on the private `intents.far` shard: they never return a public
  // transaction hash, and the intent hash is the provider's settlement identifier.
  shield: ["intent_hash"],
  unshield: ["intent_hash"],
  intents_transfer: ["intent_hash", "transfer_intent_hash", "settlement_tx_hash"],
  confidential_transfer: ["intent_hash", "settlement_tx_hash"],
  confidential_deposit: ["intent_hash"],
  cross_chain_deposit: ["settlement_tx_hash", "destination_tx_hash", "receipt_hash"],
  // Address generation only proves the provider created a deposit address, not that a deposit
  // happened. `amount_out` is an identifier, not verified settlement.
  // Provider deletion settles with its `DeleteAccount` transaction. A wallet with no on-chain
  // account is retired by erasing the API's only credential, which is itself the evidence.
  delete: ["tx_hash", "credential_erased"],
};

/**
 * A confidential route settles on the private shard, where the intent hash is the only settlement
 * identifier: shard-internal swaps and transfers never get a public transaction hash.
 */
const confidentialSettlementEvidence = ["intent_hash"] as const;
/**
 * A same-chain NEAR withdrawal is a gasless intent that `intents.near` itself executes, delivering
 * to the recipient in that execution; its intent hash identifies the settling transaction. A
 * cross-chain exit keeps needing evidence from the destination chain.
 */
const nearWithdrawEvidence = [...withdrawEvidence, "intent_hash"] as const;

function successEvidenceFor(action: string | null, result: unknown): readonly string[] {
  if (action === "withdraw")
    return value(result, "chain") === "near" ? nearWithdrawEvidence : withdrawEvidence;
  if (value(result, "confidential") === true) return confidentialSettlementEvidence;
  return action ? (settlementEvidence[action] ?? []) : [];
}

function value(value: unknown, key: string) {
  return readRecord(value)?.[key];
}

function nonEmpty(value: unknown) {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return true;
}

function hasReceipt(evidence: Record<string, unknown>, keys: readonly string[]) {
  return keys.some((key) => nonEmpty(evidence[key]));
}

export type OutcomeClassification = {
  status: OperationStatus;
  /** Provider-reported state kept separate from any verified settlement claim. */
  providerStatus: string | null;
  settlementPending: boolean;
  failureCode: string | null;
};

const pendingStatuses = new Set([
  "pending",
  "pending_approval",
  "pending_deposit",
  "processing",
  "approved",
]);
const terminalFailureStatuses = new Set([
  "partially_failed",
  "failed",
  "refunded",
  "rejected",
  "expired",
  "cancelled",
]);

/**
 * Reads the fields the classifier needs out of an untrusted provider result.
 *
 * Receipt fields may arrive at the top level, in a nested `evidence` object, or split across both
 * (a submission returns a hash, a later status poll returns a receipt). Both are merged, with the
 * nested evidence winning on conflict, so a receipt is never hidden by an earlier weaker record.
 */
function readOutcomeInputs(result: unknown) {
  const topLevel = (result as Record<string, unknown> | null) ?? {};
  const nested = value(result, "evidence");
  const evidence = {
    ...(typeof topLevel === "object" && topLevel !== null ? topLevel : {}),
    ...(nested && typeof nested === "object" ? (nested as Record<string, unknown>) : {}),
  };
  const rawStatus = value(result, "provider_status") ?? value(result, "status") ?? null;
  const settlementStatus = value(result, "settlement_status");
  const rawFailure = value(result, "failure_code");
  return {
    evidence,
    providerStatus: typeof rawStatus === "string" ? rawStatus : null,
    settlementPending:
      typeof settlementStatus === "string" &&
      /pending|processing|submitted/i.test(settlementStatus),
    failureCode: typeof rawFailure === "string" ? rawFailure : null,
  };
}

/**
 * Action-specific classifier. It is deliberately conservative: only a provider status that means
 * terminal success plus evidence appropriate to the action produces `completed`. Anything else is
 * `uncertain` or `pending`, and the settlement state is preserved rather than flattened.
 */
export function classifyExecutionOutcome(
  action: string | null,
  result: unknown,
): OutcomeClassification {
  const { evidence, providerStatus, settlementPending, failureCode } = readOutcomeInputs(result);
  const base = { providerStatus, settlementPending, failureCode };

  // No usable provider status: a hash alone is an identifier. Report uncertainty.
  if (!providerStatus || providerStatus === "unknown") return { ...base, status: "uncertain" };
  if (terminalFailureStatuses.has(providerStatus)) return { ...base, status: "failed" };
  if (pendingStatuses.has(providerStatus)) return { ...base, status: "pending" };
  if (providerStatus !== "success") return { ...base, status: "uncertain" };

  // Provider success only completes when the action's own settlement evidence is present and
  // no settlement is still pending.
  const successEvidence = successEvidenceFor(action, result);
  // OutLayer SwapResponse documents amount_out + intent_hash as the settled result.
  // Public swaps credit public balances, including assets whose home chain is external;
  // no destination-chain transaction is required until a separate withdrawal.
  const settledIntentsSwap =
    action === "swap" &&
    typeof evidence.amount_out === "string" &&
    /^[0-9]+$/.test(evidence.amount_out) &&
    /[1-9]/.test(evidence.amount_out) &&
    typeof evidence.intent_hash === "string" &&
    evidence.intent_hash.length > 0;
  if (settlementPending || (!settledIntentsSwap && !hasReceipt(evidence, successEvidence)))
    return { ...base, status: "uncertain" };
  return { ...base, status: "completed" };
}

export function operationStatusFor(kind: OperationKind, result: unknown): OperationStatus {
  if (kind === "policy" && value(result, "status") === "pending_wallet_signature") return "pending";
  if (kind === "execute") {
    const action = value(result, "action");
    return classifyExecutionOutcome(typeof action === "string" ? action : null, result).status;
  }
  if (result && typeof result === "object" && "status" in result) {
    const parsed = operationStatusSchema.safeParse((result as { status: unknown }).status);
    if (parsed.success) return parsed.data;
  }
  return "completed";
}
