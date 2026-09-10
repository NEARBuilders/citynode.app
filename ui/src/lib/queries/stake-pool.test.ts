import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatNearBalance,
  formatPoolFee,
  invalidateStakePoolQueries,
  stakePoolStatsQueryOptions,
  stakePoolTopHoldersQueryOptions,
} from "./stake-pool";

afterEach(() => vi.unstubAllGlobals());

describe("stake pool queries", () => {
  it("fetches at most 50 standard pool accounts and sorts their bigint stakes descending", async () => {
    const accounts = Array.from({ length: 55 }, (_, i) => ({
      account_id: `staker-${i}.near`,
      staked_balance: String(BigInt(i) * 10n ** 24n),
    }));
    const fetch = vi.fn().mockResolvedValue(
      Response.json({
        result: { result: [...new TextEncoder().encode(JSON.stringify(accounts))] },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient();
    const holders = await client.fetchQuery(
      stakePoolTopHoldersQueryOptions({ accountId: "pool.near", limit: 80 }),
    );
    expect(holders).toHaveLength(50);
    expect(holders[0]).toEqual({
      accountId: "staker-49.near",
      stakedBalance: 49000000000000000000000000n,
    });
    expect(holders.at(-1)).toEqual({ accountId: "staker-0.near", stakedBalance: 0n });
    const params = JSON.parse(fetch.mock.calls[0][1].body).params;
    expect(params.method_name).toBe("get_accounts");
    expect(JSON.parse(atob(params.args_base64))).toEqual({ from_index: 0, limit: 50 });
    client.clear();
  });

  it("isolates network and page-limit caches and disables unsupported pools", () => {
    const options = { accountId: "pool.near", network: "mainnet" };
    expect(stakePoolStatsQueryOptions(options).queryKey).toEqual([
      "stake-pool",
      "pool.near",
      "mainnet",
      "stats",
    ]);
    expect(stakePoolTopHoldersQueryOptions(options).queryKey).toEqual([
      "stake-pool",
      "pool.near",
      "mainnet",
      "top-holders",
    ]);
    expect(stakePoolTopHoldersQueryOptions({ ...options, limit: 5 }).queryKey).not.toEqual(
      stakePoolTopHoldersQueryOptions(options).queryKey,
    );
    expect(stakePoolStatsQueryOptions({ ...options, network: "testnet" }).queryKey).not.toEqual(
      stakePoolStatsQueryOptions(options).queryKey,
    );
    for (const makeOptions of [stakePoolStatsQueryOptions, stakePoolTopHoldersQueryOptions]) {
      expect(makeOptions(options).staleTime).toBe(300_000);
      expect(makeOptions({ ...options, protocol: "ethereum" }).enabled).toBe(false);
      expect(makeOptions({ ...options, accountId: "" }).enabled).toBe(false);
      expect(makeOptions({ ...options, network: "localnet" }).enabled).toBe(false);
    }
  });

  it("invalidates every page variant for the executed pool and network only", async () => {
    const client = new QueryClient();
    const affected = [
      ["stake-pool", "pool.near", "mainnet", "stats"],
      ["stake-pool", "pool.near", "mainnet", "top-holders"],
      ["stake-pool", "pool.near", "mainnet", "top-holders", 5],
    ];
    const untouched = [
      ["stake-pool", "pool.near", "testnet", "stats"],
      ["stake-pool", "other.near", "mainnet", "stats"],
    ];
    for (const key of [...affected, ...untouched]) client.setQueryData(key, []);

    await invalidateStakePoolQueries(client, "pool.near", "mainnet");

    for (const key of affected) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("keeps unavailable stats distinct from a valid empty account list", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { message: "Unavailable" } }));
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient();
    await expect(
      client.fetchQuery(stakePoolStatsQueryOptions({ accountId: "pool.near" })),
    ).rejects.toThrow();
    await expect(
      client.fetchQuery(stakePoolTopHoldersQueryOptions({ accountId: "pool.near" })),
    ).rejects.toThrow();
    fetch.mockResolvedValue(Response.json({ result: { result: [91, 93] } }));
    expect(
      await client.fetchQuery(stakePoolTopHoldersQueryOptions({ accountId: "pool.near" })),
    ).toEqual([]);
    client.clear();
  });

  it("reads and formats standard pool stats without losing balance precision", async () => {
    const responses: Record<string, unknown> = {
      get_total_staked_balance: "12345678900000000000000000000",
      get_reward_fee_fraction: { numerator: 5, denominator: 100 },
      get_number_of_accounts: 60,
    };
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const method = JSON.parse(String(init.body)).params.method_name;
      return Response.json({
        result: { result: [...new TextEncoder().encode(JSON.stringify(responses[method]))] },
      });
    });
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient();
    const stats = await client.fetchQuery(
      stakePoolStatsQueryOptions({ accountId: "pool.near", network: "mainnet" }),
    );
    expect(stats).toEqual({
      totalStaked: 12345678900000000000000000000n,
      feeNumerator: 5,
      feeDenominator: 100,
      stakerCount: 60,
    });
    expect(formatNearBalance(stats.totalStaked)).toBe("12,345.6789 NEAR");
    expect(formatNearBalance(9007199254740993123456789000000000000000n)).toBe(
      "9,007,199,254,740,993.1235 NEAR",
    );
    expect(formatNearBalance(999999999999999999999999n)).toBe("1 NEAR");
    expect(formatNearBalance(0n)).toBe("0 NEAR");
    expect(formatPoolFee(stats.feeNumerator, stats.feeDenominator)).toBe("5%");
    expect(fetch).toHaveBeenCalledTimes(3);
    client.clear();
  });
});
