import { afterEach, describe, expect, it, vi } from "vitest";
import { callViewFunction } from "./near-rpc";

afterEach(() => vi.unstubAllGlobals());

describe("NEAR view calls", () => {
  it.each([
    { error: { message: "Unavailable" } },
    { error: { message: "Unavailable" }, result: { result: [48] } },
    {},
    null,
    { result: { result: [] } },
    { result: { result: [255] } },
    { result: { result: [256] } },
    { result: { result: [123] } },
    { result: { result: ["48"] } },
  ])("returns null for malformed or failed RPC data: %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(callViewFunction("pool.near", "get_total_staked_balance", {})).resolves.toBeNull();
  });

  it("returns null for HTTP errors, invalid response JSON, and network rejection", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ result: { result: [48] } }, { status: 503 }))
      .mockResolvedValueOnce(new Response("invalid JSON"))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetch);
    for (let i = 0; i < 3; i++) {
      await expect(
        callViewFunction("pool.near", "get_total_staked_balance", {}),
      ).resolves.toBeNull();
    }
  });

  it("does not direct unknown networks to mainnet", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(
      await callViewFunction("pool.near", "get_total_staked_balance", {}, "localnet"),
    ).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("decodes a pool balance and sends UTF-8 JSON arguments to the selected network", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { result: [...new TextEncoder().encode('"1234500000000000000000000"')] },
      }),
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("Buffer", undefined);

    expect(
      await callViewFunction(
        "pool.testnet",
        "get_total_staked_balance",
        { memo: "東京" },
        "testnet",
      ),
    ).toBe("1234500000000000000000000");
    expect(fetch).toHaveBeenCalledWith("https://rpc.testnet.near.org", expect.any(Object));
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      method: "query",
      params: {
        request_type: "call_function",
        account_id: "pool.testnet",
        method_name: "get_total_staked_balance",
        args_base64: "eyJtZW1vIjoi5p2x5LqsIn0=",
        finality: "final",
      },
    });
  });
});
