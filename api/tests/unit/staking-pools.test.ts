import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

const near = vi.hoisted(() => ({ view: vi.fn() }));

vi.mock("../../src/services/near-rpc", () => ({ viewFunction: near.view }));

const { makeStakingPools, StakingPoolCheckFailed, UnsupportedStakingNetwork } = await import(
  "../../src/services/staking-pools"
);

const whitelists = { mainnet: "whitelist.mainnet", testnet: "whitelist.testnet" };

afterEach(() => {
  near.view.mockReset();
});

describe("makeStakingPools", () => {
  it.each([
    ["mainnet", "whitelist.mainnet"],
    ["testnet", "whitelist.testnet"],
  ])("asks the %s whitelist whether the account is approved", async (network, whitelist) => {
    near.view.mockResolvedValue(true);

    const approved = await Effect.runPromise(
      makeStakingPools(whitelists).isApproved("pool.poolv1.near", network),
    );

    expect(approved).toBe(true);
    expect(near.view).toHaveBeenCalledWith({
      accountId: whitelist,
      methodName: "is_whitelisted",
      args: { staking_pool_account_id: "pool.poolv1.near" },
      network,
    });
  });

  it.each([
    false,
    null,
    "true",
  ])("treats a whitelist answer of %j as not approved", async (answer) => {
    near.view.mockResolvedValue(answer);

    const approved = await Effect.runPromise(
      makeStakingPools(whitelists).isApproved("not-a-pool.near", "mainnet"),
    );

    expect(approved).toBe(false);
  });

  it("fails when the whitelist can't be read", async () => {
    near.view.mockRejectedValue(new Error("rpc down"));

    const exit = await Effect.runPromiseExit(
      makeStakingPools(whitelists).isApproved("pool.poolv1.near", "mainnet"),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Exit.findErrorOption(exit);
      expect(error._tag === "Some" && error.value).toBeInstanceOf(StakingPoolCheckFailed);
    }
  });

  it("rejects networks without a whitelist without calling NEAR", async () => {
    const exit = await Effect.runPromiseExit(
      makeStakingPools(whitelists).isApproved("pool.poolv1.near", "betanet"),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const error = Exit.findErrorOption(exit);
      expect(error._tag === "Some" && error.value).toBeInstanceOf(UnsupportedStakingNetwork);
    }
    expect(near.view).not.toHaveBeenCalled();
  });

  it("answers repeat checks from a short cache instead of calling NEAR each time", async () => {
    near.view.mockResolvedValue(true);
    let clock = 0;
    const pools = makeStakingPools(whitelists, () => clock);

    await Effect.runPromise(pools.isApproved("pool.poolv1.near", "mainnet"));
    await Effect.runPromise(pools.isApproved("pool.poolv1.near", "mainnet"));
    expect(near.view).toHaveBeenCalledTimes(1);

    clock = 5 * 60_000 + 1;
    await Effect.runPromise(pools.isApproved("pool.poolv1.near", "mainnet"));
    expect(near.view).toHaveBeenCalledTimes(2);
  });

  it("drops the oldest cached answer once the cache is full", async () => {
    near.view.mockResolvedValue(true);
    const pools = makeStakingPools(whitelists);

    for (let index = 0; index <= 1_000; index++) {
      await Effect.runPromise(pools.isApproved(`pool-${index}.poolv1.near`, "mainnet"));
    }
    await Effect.runPromise(pools.isApproved("pool-1000.poolv1.near", "mainnet"));
    expect(near.view).toHaveBeenCalledTimes(1_001);

    await Effect.runPromise(pools.isApproved("pool-0.poolv1.near", "mainnet"));
    expect(near.view).toHaveBeenCalledTimes(1_002);
  });

  it("does not cache a failed check", async () => {
    near.view.mockRejectedValueOnce(new Error("rpc down")).mockResolvedValueOnce(true);
    const pools = makeStakingPools(whitelists);

    await Effect.runPromiseExit(pools.isApproved("pool.poolv1.near", "mainnet"));
    expect(await Effect.runPromise(pools.isApproved("pool.poolv1.near", "mainnet"))).toBe(true);
  });
});
