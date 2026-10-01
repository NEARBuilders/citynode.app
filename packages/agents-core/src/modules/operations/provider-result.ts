const knownStatuses = [
  "pending",
  "pending_approval",
  "pending_deposit",
  "processing",
  "approved",
  "success",
  "partially_failed",
  "failed",
  "refunded",
  "rejected",
  "expired",
  "cancelled",
  "needs_review",
] as const;

type RecordValue = Record<string, unknown>;

export type ProviderResult = {
  status: string;
  provider_request_id?: string;
  [key: string]: unknown;
};

/** Narrows an untrusted provider payload to a record before any field is read from it. */
export function readRecord(value: unknown): RecordValue | null {
  return value && typeof value === "object" ? (value as RecordValue) : null;
}

export function readString(value: unknown, key: string) {
  const field = readRecord(value)?.[key];
  return typeof field === "string" ? field : null;
}

function readNumber(value: unknown, key: string) {
  const field = readRecord(value)?.[key];
  return typeof field === "number" && Number.isSafeInteger(field) ? field : null;
}

function readBoolean(value: unknown, key: string) {
  return readRecord(value)?.[key] === true;
}

function firstString(primary: unknown, secondary: unknown, key: string) {
  return readString(primary, key) ?? readString(secondary, key);
}

const evidenceKeys = [
  "approval_id",
  "request_hash",
  "tx_hash",
  "intent_hash",
  "transfer_intent_hash",
  "destination_tx_hash",
  "receipt_id",
  "receipt_hash",
  "settlement_status",
  "settlement_tx_hash",
  "settled_at",
  "refund_tx_hash",
  "refund_status",
  "failure_code",
  "failure_reason",
  "fee",
  "fee_amount",
  "fee_token",
  "provider_fee",
  "provider_fee_amount",
  "provider_fee_token",
  "solver_fee",
  "solver_fee_amount",
  "solver_fee_token",
  "protocol_fee",
  "protocol_fee_amount",
  "protocol_fee_token",
  "amount_out",
  "deposit_address",
  "intent_id",
  "expires_at",
  "poll_url",
  "token",
  "amount",
  "created_at",
  "memo",
] as const;

function copyStringEvidence(evidence: RecordValue, primary: unknown, secondary: unknown) {
  for (const key of evidenceKeys) {
    const field = firstString(primary, secondary, key);
    if (field !== null) evidence[key] = field;
  }
}

function copyNumericEvidence(evidence: RecordValue, primary: unknown, secondary: unknown) {
  const estimatedTime =
    readNumber(primary, "estimated_time_secs") ?? readNumber(secondary, "estimated_time_secs");
  if (estimatedTime !== null) evidence.estimated_time_secs = estimatedTime;
  for (const key of ["required", "approved"] as const) {
    const value = readNumber(primary, key) ?? readNumber(secondary, key);
    if (value !== null) evidence[key] = value;
  }
}

function copyArrayEvidence(
  evidence: RecordValue,
  primary: unknown,
  secondary: unknown,
  key: "promises",
) {
  const primaryValue = readRecord(primary)?.[key];
  const secondaryValue = readRecord(secondary)?.[key];
  const value = Array.isArray(primaryValue)
    ? primaryValue
    : Array.isArray(secondaryValue)
      ? secondaryValue
      : null;
  if (value) evidence[key] = value;
}

/**
 * 1Click-settled routes report the delivery transaction only inside `swap_details`, as
 * camelCase arrays of plain hashes. The first destination hash is the payout transaction.
 */
function copySwapDetailsEvidence(evidence: RecordValue, primary: unknown, secondary: unknown) {
  if (evidence.destination_tx_hash !== undefined) return;
  const details = readRecord(
    readRecord(primary)?.swap_details ?? readRecord(secondary)?.swap_details,
  );
  const hashes = details?.destinationChainTxHashes;
  const first = Array.isArray(hashes) ? hashes[0] : undefined;
  const hash = typeof first === "string" ? first : readString(first, "hash");
  if (hash && hash.length <= 256) evidence.destination_tx_hash = hash;
}

function readEvidence(primary: unknown, secondary: unknown) {
  const evidence: RecordValue = {};
  copyStringEvidence(evidence, primary, secondary);
  copySwapDetailsEvidence(evidence, primary, secondary);
  copyNumericEvidence(evidence, primary, secondary);
  copyArrayEvidence(evidence, primary, secondary, "promises");
  if (readBoolean(primary, "already_registered")) evidence.already_registered = true;
  return evidence;
}

export function providerResult(value: unknown): ProviderResult {
  const nested = readRecord(value)?.result;
  const raw = firstString(value, nested, "status");
  const requestId = firstString(value, nested, "request_id");
  const evidence = readEvidence(value, nested);
  // OutLayer's request status names a finished request `completed` as well as `success`; both
  // are the same claim, and success still needs the action's own settlement evidence.
  const canonical = raw === "completed" ? "success" : raw;
  const normalizedStatus =
    canonical && (knownStatuses as readonly string[]).includes(canonical) ? canonical : null;
  if (normalizedStatus === null && raw !== null) evidence.provider_status = raw;
  return {
    /**
     * A missing provider status is reported as `unknown`. It must not be upgraded to `success`
     * just because the response carried a hash, an amount, or an evidence array: those are
     * identifiers, not proof of settlement. The action-specific classifier in `outcome.ts`
     * decides what the evidence actually establishes.
     */
    status: normalizedStatus ?? "unknown",
    ...(requestId ? { provider_request_id: requestId } : {}),
    ...evidence,
  };
}
