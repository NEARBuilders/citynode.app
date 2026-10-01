import type { FailoverRpcProvider } from "near-api-js";
import { isTransportFailure } from "./near-rpc.js";

type FinalOutcome = Awaited<ReturnType<FailoverRpcProvider["viewTransactionStatus"]>>;

export type FinalityOptions = {
  /** Upper bound on the whole wait. The caller keeps the persisted hash for reconciliation. */
  timeoutMs?: number;
  pollIntervalMs?: number;
  /** Identical signed bytes are resent while the chain has not seen the hash. */
  rebroadcastIntervalMs?: number;
};

/** The access key a transaction was signed with and the nonce it consumes. */
export type NonceWitness = { publicKey: string; nonce: bigint };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Broadcasts signed bytes and polls for finality instead of holding one RPC request open.
 *
 * `send_tx` with `wait_until: FINAL` keeps an HTTP request open for several blocks. Rate-limited
 * RPC gateways cut such requests with HTTP 408 (drpc's free plan does so after ~2 s), and
 * near-api-js retries 408 twelve times with exponential backoff: ~85 s of sleeping before the
 * failover provider is even tried, for a transaction that finalized in ~3 s. Here the broadcast
 * returns once the node accepts the transaction, and short `tx` status reads, each answered
 * immediately, observe finality.
 *
 * `broadcast` must resend the same signed bytes: a resubmission has the same hash and nonce, so
 * the chain executes it at most once. Validation errors from the first broadcast (for example
 * `InvalidNonce`) are rethrown, because they prove the transaction never executed. A transport
 * failure is not proof either way, so it only falls through to polling.
 *
 * Nodes accept a stale-nonce transaction under `wait_until: NONE` without error, so the broadcast
 * alone never proves `InvalidNonce`. A consumed nonce can belong to the original transaction
 * while status is unavailable, so finality times out uncertain instead of authorizing replacement.
 */
export async function awaitFinalTransaction(input: {
  provider: Pick<FailoverRpcProvider, "viewTransactionStatus">;
  transactionHash: string;
  senderId: string;
  broadcast: () => Promise<unknown>;
  options?: FinalityOptions;
}): Promise<FinalOutcome> {
  const timeoutMs = input.options?.timeoutMs ?? 60_000;
  const pollIntervalMs = input.options?.pollIntervalMs ?? 500;
  const rebroadcastIntervalMs = input.options?.rebroadcastIntervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;
  try {
    await input.broadcast();
  } catch (error) {
    if (!isTransportFailure(error)) throw error;
  }
  let lastBroadcast = Date.now();
  while (true) {
    const outcome = await readOutcome(input.provider, input.transactionHash, input.senderId);
    if (outcome?.final_execution_status === "FINAL") return outcome;
    if (Date.now() >= deadline)
      throw Object.assign(new Error("transaction_finality_timeout"), {
        code: "transaction_finality_timeout",
      });
    if (!outcome && Date.now() - lastBroadcast >= rebroadcastIntervalMs) {
      lastBroadcast = Date.now();
      // A rebroadcast may race inclusion and report a used nonce; the next status read decides.
      await input.broadcast().catch(() => undefined);
    }
    await sleep(pollIntervalMs);
  }
}

/** Whether the finalized access-key nonce reached the witness; `undefined` when unreadable. */
export async function nonceConsumed(
  provider: Partial<Pick<FailoverRpcProvider, "viewAccessKey">>,
  accountId: string,
  witness: NonceWitness,
): Promise<boolean | undefined> {
  if (!provider.viewAccessKey) return undefined;
  try {
    const access = await provider.viewAccessKey({
      accountId,
      publicKey: witness.publicKey,
      finalityQuery: { finality: "final" },
    });
    return BigInt(access.nonce) >= witness.nonce;
  } catch {
    return undefined;
  }
}

/**
 * One immediate status read. Unknown and unreachable both read as "not yet": neither is evidence
 * that the hash is absent, so the wait can only end FINAL or timed out.
 */
async function readOutcome(
  provider: Pick<FailoverRpcProvider, "viewTransactionStatus">,
  transactionHash: string,
  senderId: string,
): Promise<FinalOutcome | null> {
  try {
    return await provider.viewTransactionStatus({
      txHash: transactionHash,
      accountId: senderId,
      waitUntil: "NONE",
    });
  } catch {
    return null;
  }
}
