import { describe, expect, it, vi } from "vitest";
import {
  backoffDelayMs,
  DEFAULT_RPC_URLS,
  NearRpcUnavailableError,
  NearViewCallError,
  resolveNetwork,
  rpcUrlsFor,
  viewFunction,
} from "../../src/services/near-rpc";

const policy = { roles: [{ name: "council", kind: { Group: ["alice.near"] } }] };

function bytes(value: unknown) {
  return [...Buffer.from(JSON.stringify(value))];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const okResponse = () =>
  jsonResponse({ jsonrpc: "2.0", id: "citynode", result: { result: bytes(policy), logs: [] } });

function fetchSequence(...steps: Array<() => Response | Promise<Response>>) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    const step = steps[Math.min(calls.length - 1, steps.length - 1)];
    return step ? step() : okResponse();
  });
  return { fetch: impl as unknown as typeof globalThis.fetch, calls };
}

const base = {
  accountId: "city.sputnik-dao.near",
  methodName: "get_policy",
  network: "mainnet" as const,
  urls: ["https://a.example", "https://b.example"],
};

describe("resolveNetwork", () => {
  it("uses the account suffix over any hint or env", () => {
    expect(resolveNetwork("city.sputnik-dao.testnet", "mainnet", { NEAR_NETWORK: "mainnet" })).toBe(
      "testnet",
    );
    expect(resolveNetwork("city.sputnik-dao.near", "testnet", { NEAR_NETWORK: "testnet" })).toBe(
      "mainnet",
    );
  });

  it("falls back to the hint, then NEAR_NETWORK, then mainnet for unsuffixed accounts", () => {
    const implicit = "a".repeat(64);
    expect(resolveNetwork(implicit, "testnet", {})).toBe("testnet");
    expect(resolveNetwork(implicit, undefined, { NEAR_NETWORK: "testnet" })).toBe("testnet");
    expect(resolveNetwork(implicit, undefined, { NEAR_NETWORK: "bogus" })).toBe("mainnet");
    expect(resolveNetwork(implicit, undefined, {})).toBe("mainnet");
  });
});

describe("rpcUrlsFor", () => {
  it("defaults to supported endpoints, never the deprecated near.org RPC", () => {
    for (const network of ["mainnet", "testnet"] as const) {
      const urls = rpcUrlsFor(network, {});
      expect(urls).toEqual([...DEFAULT_RPC_URLS[network]]);
      expect(urls.length).toBeGreaterThan(1);
      expect(urls.join()).not.toMatch(/rpc\.(mainnet|testnet)\.near\.org/);
      expect(urls[0]).toContain(network === "mainnet" ? "mainnet" : "testnet");
    }
  });

  it("reads a comma-separated override per network", () => {
    const env = { NEAR_RPC_URLS_TESTNET: " https://one.example , ,https://two.example" };
    expect(rpcUrlsFor("testnet", env)).toEqual(["https://one.example", "https://two.example"]);
    expect(rpcUrlsFor("mainnet", env)).toEqual([...DEFAULT_RPC_URLS.mainnet]);
  });
});

describe("viewFunction", () => {
  it("decodes the view result and sends a call_function query", async () => {
    const { fetch, calls } = fetchSequence(okResponse);
    await expect(viewFunction({ ...base, fetch })).resolves.toEqual(policy);
    expect(calls).toEqual(["https://a.example"]);
    const init = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      method: "query",
      params: {
        request_type: "call_function",
        account_id: "city.sputnik-dao.near",
        method_name: "get_policy",
        args_base64: "e30=",
      },
    });
  });

  it("retries 429s on the next endpoint with exponential backoff", async () => {
    const sleep = vi.fn(async () => {});
    const { fetch, calls } = fetchSequence(
      () => jsonResponse({ error: "endpoint is deprecated" }, 429),
      () => jsonResponse({}, 503),
      okResponse,
    );
    await expect(viewFunction({ ...base, fetch, sleep, baseDelayMs: 100 })).resolves.toEqual(
      policy,
    );
    expect(calls).toEqual(["https://a.example", "https://b.example", "https://a.example"]);
    expect(sleep.mock.calls).toEqual([[100], [200]]);
  });

  it("caps the backoff delay", () => {
    expect(backoffDelayMs(0, 250)).toBe(250);
    expect(backoffDelayMs(2, 250)).toBe(1000);
    expect(backoffDelayMs(10, 250)).toBe(2000);
  });

  it("aborts a hung request after the timeout and reports the RPC as unavailable", async () => {
    const hang = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const sleep = vi.fn(async () => {});
    const failure = await viewFunction({
      ...base,
      fetch: hang as unknown as typeof globalThis.fetch,
      sleep,
      timeoutMs: 10,
      maxAttempts: 2,
    }).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(NearRpcUnavailableError);
    expect((failure as NearRpcUnavailableError).attempts).toBe(2);
    expect((failure as Error).message).toMatch(/timed out after 10ms/);
    expect(hang).toHaveBeenCalledTimes(2);
    for (const call of hang.mock.calls) expect(call[1]?.signal?.aborted).toBe(true);
  });

  it("treats network errors and node-side rpc errors as unavailable", async () => {
    const { fetch } = fetchSequence(
      () => {
        throw new TypeError("fetch failed");
      },
      () =>
        jsonResponse({
          error: { name: "HANDLER_ERROR", cause: { name: "UNKNOWN_BLOCK" }, code: -32000 },
        }),
      () => jsonResponse({ result: {} }),
    );
    await expect(viewFunction({ ...base, fetch, sleep: async () => {} })).rejects.toBeInstanceOf(
      NearRpcUnavailableError,
    );
  });

  it.each([
    [
      "UNKNOWN_ACCOUNT",
      {
        error: {
          name: "HANDLER_ERROR",
          cause: { name: "UNKNOWN_ACCOUNT" },
          data: "account x.near does not exist while viewing",
        },
      },
    ],
    [
      "METHOD_NOT_FOUND",
      { result: { error: "wasm execution failed with error: MethodResolveError(MethodNotFound)" } },
    ],
    [
      "NO_CONTRACT_CODE",
      {
        result: {
          error:
            'wasm execution failed with error: CompilationError(CodeDoesNotExist { account_id: "x" })',
        },
      },
    ],
    ["INVALID_RESULT", { result: { result: [...Buffer.from("not json")] } }],
  ])("maps a %s answer to NearViewCallError without retrying", async (kind, body) => {
    const sleep = vi.fn(async () => {});
    const { fetch, calls } = fetchSequence(() => jsonResponse(body));
    const failure = await viewFunction({ ...base, fetch, sleep }).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(NearViewCallError);
    expect((failure as NearViewCallError).kind).toBe(kind);
    expect(calls).toHaveLength(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
