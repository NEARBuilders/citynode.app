import type { FailoverRpcProvider } from "near-api-js";
import { type NonceWitness, nonceConsumed } from "./finality.js";
import { isUnknownEverywhere } from "./near-rpc.js";

/** `dropped`: the transaction never executed and never can; its nonce went to another one. */
export type SponsorTransactionStatus = "pending" | "succeeded" | "failed" | "dropped";

/**
 * Portable relay outcome. `status` is the raw execution status the chain returned, kept as an
 * opaque record so consumers do not depend on the RPC provider's generated types.
 */
export type RelayTransactionOutcome = {
  transactionHash: string;
  finalExecutionStatus: string;
  status: Record<string, unknown>;
};

/**
 * A relayed transaction is only settled when the chain finalized it *and* execution produced a
 * success value. `FINAL` alone means "decided", not "succeeded": a finalized failure receipt is a
 * failed relay.
 */
export function transactionSucceeded<T extends { final_execution_status: string; status: unknown }>(
  result: T,
): result is T & { status: Record<string, unknown> } {
  return (
    result.final_execution_status === "FINAL" &&
    typeof result.status === "object" &&
    result.status !== null &&
    "SuccessValue" in result.status
  );
}

/**
 * Observation-only re-read of a relayed transaction, used to reconcile a persisted hash. The read
 * returns the current status immediately; a long-poll `FINAL` read is cut by rate-limited RPCs.
 *
 * With the nonce the transaction was signed at, a hash no endpoint knows is `dropped` once the
 * finalized access-key nonce has reached it. The nonce is read first: if the transaction itself had
 * consumed it, it was final before the status read, and the status read would find it. The caller
 * must only pass a witness while the transaction is within the RPC retention window, because a
 * garbage-collected hash is also unknown.
 */
export async function sponsorTransactionStatus(
  provider: FailoverRpcProvider,
  accountId: string,
  transactionHash: string,
  witness?: NonceWitness,
): Promise<SponsorTransactionStatus> {
  const consumed = witness ? await nonceConsumed(provider, accountId, witness) : undefined;
  let result: Awaited<ReturnType<FailoverRpcProvider["viewTransactionStatus"]>>;
  try {
    result = await provider.viewTransactionStatus({
      txHash: transactionHash,
      accountId,
      waitUntil: "NONE",
    });
  } catch (error) {
    if (consumed === true && isUnknownEverywhere(error)) return "dropped";
    throw error;
  }
  if (result.final_execution_status !== "FINAL") return "pending";
  return transactionSucceeded(result) ? "succeeded" : "failed";
}
