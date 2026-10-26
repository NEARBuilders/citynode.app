import { Data } from "effect";

export type NearNetworkId = "mainnet" | "testnet";

export const DEFAULT_RPC_URLS: Record<NearNetworkId, readonly string[]> = {
  mainnet: ["https://rpc.mainnet.fastnear.com", "https://near.drpc.org"],
  testnet: ["https://rpc.testnet.fastnear.com", "https://near-testnet.drpc.org"],
};

const RPC_URL_ENV: Record<NearNetworkId, string> = {
  mainnet: "NEAR_RPC_URLS_MAINNET",
  testnet: "NEAR_RPC_URLS_TESTNET",
};

export const DEFAULT_TIMEOUT_MS = 4_000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 250;
const MAX_DELAY_MS = 2_000;

type Env = Record<string, string | undefined>;

function isNetworkId(value: unknown): value is NearNetworkId {
  return value === "mainnet" || value === "testnet";
}
export function resolveNetwork(
  accountId: string,
  hint?: NearNetworkId | null,
  env: Env = process.env,
): NearNetworkId {
  const id = accountId.trim().toLowerCase();
  if (id.endsWith(".testnet")) return "testnet";
  if (id.endsWith(".near")) return "mainnet";
  if (hint) return hint;
  const fromEnv = env.NEAR_NETWORK?.trim().toLowerCase();
  return isNetworkId(fromEnv) ? fromEnv : "mainnet";
}
export function rpcUrlsFor(network: NearNetworkId, env: Env = process.env): string[] {
  const configured = (env[RPC_URL_ENV[network]] ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  return configured.length > 0 ? configured : [...DEFAULT_RPC_URLS[network]];
}

export function backoffDelayMs(attempt: number, baseDelayMs = DEFAULT_BASE_DELAY_MS): number {
  return Math.min(baseDelayMs * 2 ** attempt, MAX_DELAY_MS);
}
export class NearRpcUnavailableError extends Data.TaggedError("NearRpcUnavailableError")<{
  readonly network: NearNetworkId;
  readonly attempts: number;
  readonly lastError: unknown;
}> {
  override get message() {
    return `NEAR RPC unavailable on ${this.network} after ${this.attempts} attempt(s): ${errorText(this.lastError)}`;
  }
}

export type NearViewFailureKind =
  | "UNKNOWN_ACCOUNT"
  | "NO_CONTRACT_CODE"
  | "METHOD_NOT_FOUND"
  | "EXECUTION_ERROR"
  | "INVALID_RESULT";
export class NearViewCallError extends Data.TaggedError("NearViewCallError")<{
  readonly accountId: string;
  readonly methodName: string;
  readonly kind: NearViewFailureKind;
  readonly detail: string;
}> {
  override get message() {
    return `${this.accountId}.${this.methodName}: ${this.kind} (${this.detail})`;
  }
}

export interface ViewFunctionOptions {
  accountId: string;
  methodName: string;
  args?: Record<string, unknown>;
  network: NearNetworkId;
  urls?: readonly string[];
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  fetch?: typeof globalThis.fetch;
  sleep?: (ms: number) => Promise<void>;
}

class RetryableRpcError extends Error {}

const CONTRACT_ERROR_CAUSES: Record<string, NearViewFailureKind> = {
  UNKNOWN_ACCOUNT: "UNKNOWN_ACCOUNT",
  INVALID_ACCOUNT: "UNKNOWN_ACCOUNT",
  NO_CONTRACT_CODE: "NO_CONTRACT_CODE",
  CONTRACT_EXECUTION_ERROR: "EXECUTION_ERROR",
};

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function endpointHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "rpc endpoint";
  }
}

function wasmFailureKind(error: string): NearViewFailureKind {
  if (error.includes("MethodNotFound")) return "METHOD_NOT_FOUND";
  if (error.includes("CodeDoesNotExist")) return "NO_CONTRACT_CODE";
  return "EXECUTION_ERROR";
}

function base64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64");
}

async function postView(
  url: string,
  options: ViewFunctionOptions,
  timeoutMs: number,
  fetchImpl: typeof globalThis.fetch,
): Promise<unknown> {
  const { accountId, methodName } = options;
  const endpoint = endpointHost(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let body: unknown;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "citynode",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: accountId,
          method_name: methodName,
          args_base64: base64Json(options.args ?? {}),
        },
      }),
    });
    if (!res.ok) throw new RetryableRpcError(`${endpoint} responded ${res.status}`);
    body = await res.json();
  } catch (err) {
    if (err instanceof RetryableRpcError) throw err;
    if (controller.signal.aborted) {
      throw new RetryableRpcError(`${endpoint} timed out after ${timeoutMs}ms`);
    }
    throw new RetryableRpcError(`${endpoint} request failed: ${errorText(err)}`);
  } finally {
    clearTimeout(timer);
  }

  const envelope = (body ?? {}) as {
    error?: { cause?: { name?: unknown }; data?: unknown; message?: unknown };
    result?: { result?: unknown; error?: unknown };
  };

  if (envelope.error) {
    const causeName = envelope.error.cause?.name;
    const kind = typeof causeName === "string" ? CONTRACT_ERROR_CAUSES[causeName] : undefined;
    const data = typeof envelope.error.data === "string" ? envelope.error.data : "";
    if (kind || data.includes("does not exist while viewing")) {
      throw new NearViewCallError({
        accountId,
        methodName,
        kind: kind ?? "UNKNOWN_ACCOUNT",
        detail: data || String(causeName),
      });
    }
    throw new RetryableRpcError(
      `${endpoint} rpc error: ${String(causeName ?? envelope.error.message ?? "unknown")}`,
    );
  }

  const result = envelope.result;
  if (typeof result?.error === "string") {
    throw new NearViewCallError({
      accountId,
      methodName,
      kind: wasmFailureKind(result.error),
      detail: result.error,
    });
  }
  if (!Array.isArray(result?.result)) {
    throw new RetryableRpcError(`${endpoint} returned no result`);
  }

  try {
    return JSON.parse(Buffer.from(result.result as number[]).toString("utf8"));
  } catch (err) {
    throw new NearViewCallError({
      accountId,
      methodName,
      kind: "INVALID_RESULT",
      detail: errorText(err),
    });
  }
}
export async function viewFunction<T>(options: ViewFunctionOptions): Promise<T> {
  const urls = options.urls?.length ? options.urls : rpcUrlsFor(options.network);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) await sleep(backoffDelayMs(attempt - 1, options.baseDelayMs));
    const url = urls[attempt % urls.length] as string;
    try {
      return (await postView(url, options, timeoutMs, fetchImpl)) as T;
    } catch (err) {
      if (err instanceof NearViewCallError) throw err;
      lastError = err;
    }
  }
  throw new NearRpcUnavailableError({
    network: options.network,
    attempts: maxAttempts,
    lastError,
  });
}
