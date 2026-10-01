import { getOutlayer } from "../../lib/outlayer.js";
import { ApiError } from "../../shared/errors.js";
import { type ProviderResult, providerResult, readRecord, readString } from "./provider-result.js";

const depositActions = new Set(["cross_chain_deposit"]);

/** Only canonical inbound routes may use the provider's deposit-status identity. */
export function depositIntentId(result: unknown) {
  return depositActions.has(readString(result, "action") ?? "")
    ? readString(result, "intent_id")
    : null;
}

/**
 * OutLayer answers a new deposit with the one-time address and its intent id, and no status. That
 * answer means exactly one thing: the address exists and waits for funds. Reading it as an unknown
 * outcome would report a live deposit address as UNCERTAIN.
 */
export function depositAddressIssued(action: string, projected: ProviderResult): ProviderResult {
  if (!depositActions.has(action) || projected.status !== "unknown") return projected;
  const issued = Boolean(projected.deposit_address) && Boolean(projected.intent_id);
  return issued ? { ...projected, status: "pending_deposit" } : projected;
}

/**
 * The public deposit status in the API's vocabulary. OutLayer reports `bridging` from the moment
 * the address exists, paid or not (observed live on mainnet), so it proves nothing about funds:
 * the deposit keeps waiting unless the attached 1Click status says the deposit was seen.
 */
const depositStatuses: Record<string, string> = {
  pending: "pending_deposit",
  bridging: "pending_deposit",
};
/** 1Click's own deposit states, when OutLayer attaches them as `result.status`. */
const oneClickDepositStatuses: Record<string, string> = {
  PENDING_DEPOSIT: "pending_deposit",
  INCOMPLETE_DEPOSIT: "pending_deposit",
  KNOWN_DEPOSIT_TX: "processing",
  PROCESSING: "processing",
};

function publicDepositStatus(status: string | null, nested: unknown) {
  if (status !== "bridging" && status !== "pending") return undefined;
  const oneClick = readString(nested, "status");
  return (oneClick && oneClickDepositStatuses[oneClick]) ?? depositStatuses[status];
}

/** 1Click lists hashes as plain strings or as `{ hash, explorerUrl }`; the first is the one. */
function firstHash(value: unknown, key: string) {
  const values = readRecord(value)?.[key];
  const first = Array.isArray(values) ? values[0] : undefined;
  const hash = typeof first === "string" ? first : readString(first, "hash");
  return hash && hash.length <= 256 ? hash : undefined;
}

/** Deposit status uses intent_id and nested 1Click hash arrays, not request_id. */
export async function observeDeposit(credential: string, intentId: string, prior: unknown) {
  const confidential = readRecord(prior)?.confidential === true;
  const provider = getOutlayer();
  const response = confidential
    ? await provider.requestStatus(credential, intentId)
    : await provider.depositIntentStatus(credential, intentId);
  const nested = readRecord(response)?.result;
  const address = readString(response, "deposit_address") ?? readString(nested, "deposit_address");
  const identity = confidential ? "request_id" : "intent_id";
  if (
    readString(response, identity) !== intentId ||
    (address !== null && address !== readString(prior, "deposit_address"))
  )
    throw new ApiError("provider_request_mismatch", 502);
  // The settled 1Click status sits in `result`, its hashes under `swap_details` (OutLayer's
  // spelling), `swapDetails` (1Click's) or directly.
  const settled =
    readRecord(nested)?.swap_details ?? readRecord(nested)?.swapDetails ?? nested ?? null;
  const status = confidential
    ? undefined
    : publicDepositStatus(readString(response, "status"), nested);
  const intentHash = firstHash(settled, "intentHashes");
  const destinationHash = firstHash(settled, "destinationChainTxHashes");
  // A deposit into Intents has no destination chain: 1Click leaves `destinationChainTxHashes`
  // empty (observed live for Base USDC) and names the NEAR transaction that credited the balance.
  const settlementHash = firstHash(settled, "nearTxHashes");
  return providerResult({
    ...readRecord(response),
    ...(status ? { status } : {}),
    // Only add what the settled status proves; never blank a hash the response itself carried.
    ...(intentHash ? { intent_hash: intentHash } : {}),
    ...(destinationHash ? { destination_tx_hash: destinationHash } : {}),
    ...(settlementHash ? { settlement_tx_hash: settlementHash } : {}),
  });
}
