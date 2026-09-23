/**
 * Remote-entry loading resilience — the ONE contract every MF consumer in
 * the dev stack shares (plugin dev serves, the host's plugin loader).
 *
 * Two failure classes it exists for:
 * 1. Cold compile: remoteEntry.js 404s until the remote's first build —
 *    the 404 body gets eval'd as JS ("Unexpected identifier 'Found'").
 * 2. Watch-rebuild poisoning: a failed entry load is memoized forever in
 *    `globalThis.__GLOBAL_LOADING_REMOTE_ENTRY__` (runtime-core never evicts
 *    rejections), so retries without a purge await the same failure.
 */

const POLL_INTERVAL_MS = 300;
const DEFAULT_TIMEOUT_MS = 120_000;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 5_000;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Deletes the failed remote's keys from the process-global entry-load cache.
 * Deleting a RESOLVED entry would force a wasteful re-eval, so only call
 * this from failure paths.
 */
export const purgeRemoteEntryCache = (remoteUrl: string): void => {
  const globalLoading = (globalThis as Record<string, unknown>).__GLOBAL_LOADING_REMOTE_ENTRY__ as
    | Record<string, unknown>
    | undefined;
  if (!globalLoading) return;
  for (const key of Object.keys(globalLoading)) {
    if (key.endsWith(`:${remoteUrl}`)) delete globalLoading[key];
  }
};

export const isRemoteEntryBody = (body: string): boolean =>
  !/not found|<(!doctype|html)/i.test(body.slice(0, 64));

export const waitForRemoteEntryReady = async (
  label: string,
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  let announced = false;
  while (Date.now() < deadline) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok && isRemoteEntryBody(await res.text().catch(() => ""))) return;
    if (!announced) {
      announced = true;
      console.log(`⏳ waiting for ${label} to compile (remote entry not ready)…`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`${label} remote entry never became ready at ${url}`);
};

export interface RemoteEntryResilienceOptions<T> {
  label: string;
  remoteUrl: string;
  load: () => Promise<T>;
  /** called with each failure before the next backoff attempt */
  onFailure?: (error: unknown) => void;
  timeoutMs?: number;
}

/**
 * Poll the remote entry until it is actually served, then load with
 * bounded retry — purging the poisoned global entry cache between attempts
 * so each retry genuinely re-fetches.
 */
export async function withRemoteEntryResilience<T>(
  options: RemoteEntryResilienceOptions<T>,
): Promise<T> {
  const { label, remoteUrl, load, onFailure, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  await waitForRemoteEntryReady(label, remoteUrl, timeoutMs);
  const deadline = Date.now() + timeoutMs;
  let delay = RETRY_BASE_DELAY_MS;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      purgeRemoteEntryCache(remoteUrl);
      onFailure?.(error);
      await sleep(Math.min(delay, RETRY_MAX_DELAY_MS));
      delay = Math.min(delay * 2, RETRY_MAX_DELAY_MS);
    }
  }
  throw lastError;
}
