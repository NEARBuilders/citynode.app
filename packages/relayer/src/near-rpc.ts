import { FailoverRpcProvider, JsonRpcProvider, TypedError } from "near-api-js";

/**
 * Per-endpoint retry budget. near-api-js defaults to 12 attempts with 1.5x backoff from 500 ms,
 * roughly 85 s of sleeping when an endpoint keeps answering 408/5xx. Failing fast lets the
 * failover provider move to the next endpoint instead.
 */
export const nearRpcRetryOptions = { retries: 3, wait: 250, backoff: 2 } as const;

export function isTransportFailure(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { name?: unknown; type?: unknown; cause?: unknown; message?: unknown };
  return (
    value.name === "ProviderError" ||
    value.type === "RetriesExceeded" ||
    typeof value.cause === "number" ||
    (typeof value.message === "string" && /fetch failed|network|timeout/i.test(value.message))
  );
}

function isUnknownTransaction(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "UnknownTransactionError"
  );
}

/** Whether a failed status read proves that no configured endpoint knows the transaction. */
export function isUnknownEverywhere(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { unknownEverywhere?: unknown }).unknownEverywhere === true
  );
}

class TransactionSafeFailoverRpcProvider extends FailoverRpcProvider {
  private async broadcast<T>(send: (provider: JsonRpcProvider) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (const provider of this.providers as JsonRpcProvider[]) {
      try {
        return await send(provider);
      } catch (error) {
        if (!isTransportFailure(error)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  /**
   * `wait_until: NONE` acceptance proves nothing: public endpoints also accept transactions the
   * chain will drop. Identical signed bytes therefore go to every endpoint at once, so one gateway
   * that silently loses a transaction cannot strand it; the same bytes have the same hash and
   * execute at most once. A rejection surfaces only when no endpoint accepted. Transport
   * ambiguity takes precedence over another endpoint's validation error.
   */
  private async broadcastEverywhere<T>(
    send: (provider: JsonRpcProvider) => Promise<T>,
  ): Promise<T> {
    const results = await Promise.allSettled((this.providers as JsonRpcProvider[]).map(send));
    const accepted = results.find((result) => result.status === "fulfilled");
    if (accepted) return accepted.value;
    const errors = results.map((result) => (result as PromiseRejectedResult).reason);
    throw errors.find(isTransportFailure) ?? errors.at(-1);
  }

  /**
   * Status reads are polled while a fresh transaction is still unknown to the node, so an
   * `UnknownTransaction` answer is the expected "not yet". The base failover loop logs every
   * endpoint error with `console.error`; this loop fails over the same way without the noise and
   * keeps the base `RetriesExceeded` contract, with the last endpoint error as its cause and
   * `unknownEverywhere` when every endpoint answered that it does not know the hash.
   */
  override async viewTransactionStatus(
    ...args: Parameters<FailoverRpcProvider["viewTransactionStatus"]>
  ): ReturnType<FailoverRpcProvider["viewTransactionStatus"]> {
    const errors: unknown[] = [];
    for (const provider of this.providers as JsonRpcProvider[]) {
      try {
        return await provider.viewTransactionStatus(...args);
      } catch (error) {
        errors.push(error);
      }
    }
    throw Object.assign(
      new TypedError(
        `Exceeded ${this.providers.length} providers to execute request`,
        "RetriesExceeded",
      ),
      {
        cause: errors.at(-1),
        // Every endpoint answered, and none knows the hash: not an unreachable-network failure.
        unknownEverywhere: errors.every(isUnknownTransaction),
      },
    );
  }

  override sendTransaction(...args: Parameters<FailoverRpcProvider["sendTransaction"]>) {
    return this.broadcast((provider) => provider.sendTransaction(...args));
  }

  override sendTransactionUntil(...args: Parameters<FailoverRpcProvider["sendTransactionUntil"]>) {
    return args[1] === "NONE"
      ? this.broadcastEverywhere((provider) => provider.sendTransactionUntil(...args))
      : this.broadcast((provider) => provider.sendTransactionUntil(...args));
  }

  override sendTransactionAsync(...args: Parameters<FailoverRpcProvider["sendTransactionAsync"]>) {
    return this.broadcast((provider) => provider.sendTransactionAsync(...args));
  }
}

export function createNearRpcProvider(urls: readonly string[]): FailoverRpcProvider {
  return new TransactionSafeFailoverRpcProvider(
    urls.map((url) => new JsonRpcProvider({ url }, nearRpcRetryOptions)),
  );
}
