import { Near } from "near-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthClient } from "@/app";
import { readStakePoolStatus, type StakePoolStatus } from "@/lib/queries/stake-pool";
import {
  type CommunityRewards,
  communityRewards,
  communityRewardsTarget,
  summarizeCommunityRewards,
} from "./-community-rewards";

const DAO = "harbor.sputnik-dao.near";
const POOL = "harbor.poolv1.near";

const daoTenant = { accountId: DAO, ownerKind: "dao" };
const userTenant = { accountId: "harbor.near", ownerKind: "user" };
const validators = {
  validators: [{ accountId: POOL, network: "mainnet", protocol: "near", isDefault: true }],
};

afterEach(() => vi.restoreAllMocks());

function authClient(): AuthClient {
  const near = new Near({ network: "mainnet" });
  return { near: { getNearClient: () => near } } as unknown as AuthClient;
}

async function statusFromRpc({
  owner = DAO,
  fee = { numerator: 10, denominator: 100 },
  paused = false,
  current = [POOL],
  next = [] as string[],
}: {
  owner?: string;
  fee?: { numerator: number; denominator: number };
  paused?: boolean;
  current?: string[];
  next?: string[];
}): Promise<StakePoolStatus> {
  const views: Record<string, unknown> = {
    get_owner_id: owner,
    get_reward_fee_fraction: fee,
    is_staking_paused: paused,
  };
  vi.spyOn(Near.prototype, "view").mockImplementation(async (_contract, method) => views[method]);
  vi.spyOn(Near.prototype, "rpc", "get").mockReturnValue({
    call: async () => ({
      current_validators: current.map((account_id) => ({ account_id })),
      next_validators: next.map((account_id) => ({ account_id })),
    }),
  } as never);
  return readStakePoolStatus({ accountId: POOL, authClient: authClient() });
}

const read = <T>(data: T) => ({ data, isError: false });
const failed = { data: undefined, isError: true };
const pending = { data: undefined, isError: false };

async function rewardsFor(rpc: Parameters<typeof statusFromRpc>[0]) {
  return communityRewards({
    tenant: daoTenant,
    organization: read({ metadata: null }),
    validators: read(validators),
    status: read(await statusFromRpc(rpc)),
  });
}

describe("communityRewards", () => {
  it("can claim when the team DAO owns a pool in the current validator set", async () => {
    expect(await rewardsFor({})).toEqual({ kind: "pool", pool: { kind: "earning" } });
  });

  it("names the other owner and its fee when someone else runs the pool", async () => {
    expect(await rewardsFor({ owner: "operator.near" })).toEqual({
      kind: "pool",
      pool: {
        kind: "run-by-other",
        ownerId: "operator.near",
        feeNumerator: 10,
        feeDenominator: 100,
      },
    });
  });

  it("flags a pool another account runs at full commission", async () => {
    expect(
      await rewardsFor({ owner: "operator.near", fee: { numerator: 100, denominator: 100 } }),
    ).toEqual({ kind: "pool", pool: { kind: "full-commission", ownerId: "operator.near" } });
  });

  it("reports a paused pool", async () => {
    expect(await rewardsFor({ paused: true })).toEqual({
      kind: "pool",
      pool: { kind: "paused", ownerId: null },
    });
  });

  it("reports a pool joining the validator set", async () => {
    expect(await rewardsFor({ current: [], next: [POOL] })).toEqual({
      kind: "pool",
      pool: { kind: "joining" },
    });
  });

  it("reports a pool that isn't validating", async () => {
    expect(await rewardsFor({ current: [] })).toEqual({
      kind: "pool",
      pool: { kind: "not-validating", ownerId: null },
    });
  });

  it("reads the team DAO from the organization's linked DAO first", async () => {
    const status = await statusFromRpc({ owner: "linked.sputnik-dao.near" });
    expect(
      communityRewards({
        tenant: userTenant,
        organization: read({ metadata: { daoAccountId: "linked.sputnik-dao.near" } }),
        validators: read(validators),
        status: read(status),
      }),
    ).toEqual({ kind: "pool", pool: { kind: "earning" } });
  });

  it("says there is no DAO when neither the organization nor the site has one", () => {
    expect(
      communityRewards({
        tenant: userTenant,
        organization: null,
        validators: read(validators),
        status: pending,
      }),
    ).toEqual({ kind: "no-dao" });
  });

  it("says there is no pool when the community has no readable validator", () => {
    for (const list of [[], [{ accountId: POOL, protocol: "other", isDefault: true }]]) {
      expect(
        communityRewards({
          tenant: daoTenant,
          organization: null,
          validators: read({ validators: list }),
          status: pending,
        }),
      ).toEqual({ kind: "no-pool" });
    }
  });

  it("shows an error, never a pool state, when any read fails", () => {
    const base = {
      tenant: daoTenant,
      organization: read({ metadata: null }),
      validators: read(validators),
      status: pending,
    };
    expect(communityRewards({ ...base, organization: failed })).toEqual({ kind: "error" });
    expect(communityRewards({ ...base, validators: failed })).toEqual({ kind: "error" });
    expect(communityRewards({ ...base, status: failed })).toEqual({ kind: "error" });
  });

  it("waits for every read before deciding", () => {
    const base = {
      tenant: daoTenant,
      organization: read({ metadata: null }),
      validators: read(validators),
      status: pending,
    };
    expect(communityRewards(base)).toEqual({ kind: "loading" });
    expect(communityRewards({ ...base, organization: pending })).toEqual({ kind: "loading" });
    expect(communityRewards({ ...base, validators: pending })).toEqual({ kind: "loading" });
  });
});

describe("communityRewardsTarget", () => {
  it("picks the default validator the owners' card picks", () => {
    expect(
      communityRewardsTarget(daoTenant, null, {
        validators: [
          { accountId: "other.poolv1.near", isDefault: false },
          { accountId: POOL, isDefault: true },
        ],
      }),
    ).toEqual({ teamAccountId: DAO, poolAccountId: POOL, network: "mainnet", protocol: "near" });
  });
});

describe("summarizeCommunityRewards", () => {
  it("counts only communities that can claim and leaves out the unreadable ones", () => {
    const rewards: CommunityRewards[] = [
      { kind: "pool", pool: { kind: "earning" } },
      { kind: "pool", pool: { kind: "earning" } },
      {
        kind: "pool",
        pool: { kind: "run-by-other", ownerId: "x.near", feeNumerator: 1, feeDenominator: 10 },
      },
      { kind: "error" },
      { kind: "no-dao" },
    ];
    expect(summarizeCommunityRewards(rewards)).toEqual({
      loading: false,
      canClaim: 2,
      unreadable: 1,
    });
    expect(summarizeCommunityRewards([{ kind: "loading" }]).loading).toBe(true);
  });
});
