import { OutlayerError, providerRefusalCodes } from "./errors.js";
import type { OutlayerClientOptions, ProviderRequest, WalletRequest } from "./types.js";
import { outlayerNetworks } from "./types.js";

const maxResponseBytes = 1_048_576;

function queryString(params: Record<string, string | number | undefined> = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function readBody<T>(response: Response, parse: (value: unknown) => T): Promise<T> {
  if (!response.body) throw new OutlayerError("invalid_outlayer_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxResponseBytes) throw new OutlayerError("outlayer_response_too_large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return parse({});
  try {
    return parse(JSON.parse(text));
  } catch (error) {
    if (error instanceof OutlayerError) throw error;
    throw new OutlayerError("invalid_outlayer_response");
  }
}

/**
 * OutLayer's own code, sharpened where its 400 says more: `bad_request` is a validation refusal
 * decided before anything executes, and a bridge minimum or a pair 1Click will not quote is worth
 * its own code. Only these fixed provider phrases are matched; the message itself never leaves.
 */
function refusalCode(body: unknown) {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = record.error;
  if (code !== "bad_request") return code;
  const message = typeof record.message === "string" ? record.message : "";
  if (/amount is too low/i.test(message)) return "amount_too_low";
  if (/quoting for this pair is not available/i.test(message)) return "route_unavailable";
  return "invalid_request";
}

async function responseError(response: Response, resent: boolean) {
  // 402 is OutLayer's `WalletUnderfunded`: the custody account cannot prepay an on-chain call's
  // gas, and the request never reached the chain.
  if (response.status === 402)
    return new OutlayerError("custody_native_balance_required", response.status, resent);
  const body = await readBody(response, (value) => value).catch(() => undefined);
  const code = refusalCode(body);
  // Only expose stable allowlisted codes, never provider messages or reflected credentials.
  if (typeof code === "string" && providerRefusalCodes.has(code))
    return new OutlayerError(code, response.status, resent);
  const identifier = typeof code === "string" && /^[a-z0-9_]{1,64}$/.test(code) ? code : undefined;
  return new OutlayerError("outlayer_request_failed", response.status, resent, identifier);
}

/** Fixed-origin provider transport. Credentials never come from request bodies. */
export function createOutlayerTransport(options: OutlayerClientOptions): ProviderRequest {
  const url = outlayerNetworks.mainnet.baseUrl;
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;

  const send = (input: WalletRequest) =>
    fetcher(`${url}${input.path}${queryString(input.query)}`, {
      method: input.method,
      headers: {
        accept: "application/json",
        // OutLayer deduplicates on `X-Idempotency-Key`; a plain `Idempotency-Key` alone is
        // ignored, and a resubmission then executes a second time. Both names are sent.
        ...(input.idempotencyKey
          ? { "X-Idempotency-Key": input.idempotencyKey, "Idempotency-Key": input.idempotencyKey }
          : {}),
        ...(input.apiKey ? { authorization: `Bearer ${input.apiKey}` } : {}),
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(timeoutMs),
    });

  const delayFor = options.retryDelayMs ?? ((attempt: number) => 2_000 * (attempt + 1));
  const sleep = (attempt: number) => new Promise((done) => setTimeout(done, delayFor(attempt)));

  const breaker = createBreaker(options.breakerOptions);

  // Provider rate limiting and transport blips are transient. Retries are limited to calls that
  // cannot execute twice: GETs, and POSTs carrying an Idempotency-Key. Only routes OutLayer
  // deduplicates send a key (see cross-chain.ts), so a key here is the route's dedup guarantee.
  const retryable = (input: WalletRequest) =>
    input.method === "GET" || Boolean(input.idempotencyKey);

  async function attemptRequest(
    input: WalletRequest,
    attempt: number,
  ): Promise<{ response: Response } | { retry: true } | { error: OutlayerError }> {
    let response: Response;
    try {
      response = await send(input);
    } catch (error) {
      if (error instanceof OutlayerError) return { error };
      if (!retryable(input) || attempt >= 2)
        return { error: new OutlayerError("outlayer_unavailable") };
      await sleep(attempt);
      return { retry: true };
    }
    // 429 and 503 are the provider telling us to slow down; both are safe to retry.
    if ((response.status === 429 || response.status === 503) && retryable(input) && attempt < 2) {
      await sleep(attempt);
      return { retry: true };
    }
    return { response };
  }

  return async function request(input: WalletRequest): Promise<unknown> {
    if (breaker.open()) throw new OutlayerError("outlayer_unavailable", 503);
    let lastError = new OutlayerError("outlayer_unavailable");
    for (let attempt = 0; attempt < 3; attempt++) {
      const outcome = await attemptRequest(input, attempt);
      if ("retry" in outcome) continue;
      if ("error" in outcome) {
        lastError = outcome.error;
        breaker.recordFailure();
        break;
      }
      if (!outcome.response.ok) throw await failedResponse(outcome.response, breaker, attempt > 0);
      breaker.recordSuccess();
      return successfulBody(input, outcome.response, request);
    }
    throw lastError;
  };
}

async function successfulBody(input: WalletRequest, response: Response, request: ProviderRequest) {
  const body = await readBody(response, (value) => value);
  return input.idempotencyKey ? originalOfDuplicate(input, body, request) : body;
}

/**
 * A resubmitted `X-Idempotency-Key` does not re-execute and does not echo the first result: OutLayer
 * answers 200 with `{ error: "duplicate_idempotency_key", message: "Request already processed:
 * <request_id>" }`. The original request is read back, so a retry or recovery observes the first
 * execution instead of a body with no status. An unreadable id stays unknown, never a success.
 */
async function originalOfDuplicate(
  input: WalletRequest,
  body: unknown,
  request: ProviderRequest,
): Promise<unknown> {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (record?.error !== "duplicate_idempotency_key") return body;
  const message = typeof record.message === "string" ? record.message : "";
  const requestId = /Request already processed:\s*([A-Za-z0-9-]{8,128})\b/.exec(message)?.[1];
  if (!requestId) throw new OutlayerError("duplicate_idempotency_key");
  return request({
    apiKey: input.apiKey,
    method: "GET",
    path: `/wallet/v1/requests/${encodeURIComponent(requestId)}`,
  });
}

type Breaker = {
  open(): boolean;
  recordFailure(): void;
  recordSuccess(): void;
};

/** Transport statuses mean the provider is unhealthy; a refusal means it answered. */
async function failedResponse(
  response: Response,
  breaker: Breaker,
  resent: boolean,
): Promise<OutlayerError> {
  if (response.status >= 500 || response.status === 429) breaker.recordFailure();
  else breaker.recordSuccess();
  return responseError(response, resent);
}

type BreakerState = { failures: number; openedAt: number | null };

/**
 * Minimal circuit breaker for one client instance. After `failureThreshold` consecutive
 * transport failures the client fails fast for `cooldownMs` instead of making every caller wait
 * out its own timeout. One trial request is allowed through after the cooldown (half-open):
 * success closes the breaker, failure reopens it.
 */
function createBreaker(options: OutlayerClientOptions["breakerOptions"]) {
  const threshold = options?.failureThreshold ?? 5;
  const cooldownMs = options?.cooldownMs ?? 10_000;
  const state: BreakerState = { failures: 0, openedAt: null };
  return {
    open(): boolean {
      if (state.openedAt === null) return false;
      if (Date.now() - state.openedAt >= cooldownMs) {
        state.openedAt = null;
        state.failures = 0;
        return false;
      }
      return true;
    },
    recordFailure() {
      state.failures += 1;
      if (state.failures >= threshold) state.openedAt = Date.now();
    },
    recordSuccess() {
      state.failures = 0;
      state.openedAt = null;
    },
  };
}
