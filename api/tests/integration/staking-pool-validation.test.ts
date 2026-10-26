import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { daoContext, getPluginClient } from "../setup";

const pools = vi.hoisted(() => ({ isApproved: vi.fn() }));

vi.mock("@/services/staking-pools", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/staking-pools")>();
  return { ...actual, makeStakingPools: () => ({ isApproved: pools.isApproved }) };
});

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

const { StakingPoolCheckFailed } = await import("@/services/staking-pools");

const approve = (approved: boolean) => pools.isApproved.mockReturnValue(Effect.succeed(approved));

afterEach(() => {
  pools.isApproved.mockReset();
});

async function seedNode() {
  const suffix = crypto.randomUUID().slice(0, 8);
  const owner = await getPluginClient(
    daoContext(`pool-owner-${suffix}`, `pool-org-${suffix}`, `pool-dao-${suffix}.near`),
  );
  const tenant = await owner.createTenant({ name: "Pools", accountId: `pools-${suffix}.near` });
  const node = await owner.createNode({
    name: "Pools",
    kind: "country",
    slug: `pools-${suffix}`,
    tenantId: tenant.id,
  });
  return { owner, node };
}

describe("validator staking pool approval", () => {
  it("saves a validator whose account is an approved pool", async () => {
    const { owner, node } = await seedNode();
    approve(true);

    const validator = await owner.createValidator({
      nodeId: node.id,
      accountId: "approved.poolv1.near",
      network: "mainnet",
    });

    expect(validator).toMatchObject({ accountId: "approved.poolv1.near", network: "mainnet" });
    expect(pools.isApproved).toHaveBeenCalledWith("approved.poolv1.near", "mainnet");
  });

  it("refuses an account that isn't an approved pool and saves nothing", async () => {
    const { owner, node } = await seedNode();
    approve(false);

    await expect(
      owner.createValidator({ nodeId: node.id, accountId: "not-a-pool.near", network: "mainnet" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      data: {
        invalidFields: ["accountId"],
        validationErrors: [expect.objectContaining({ code: "STAKING_POOL_NOT_APPROVED" })],
      },
    });
    expect(await owner.listValidators({ nodeId: node.id })).toEqual([]);
  });

  it("refuses to save when the whitelist can't be checked", async () => {
    const { owner, node } = await seedNode();
    pools.isApproved.mockReturnValue(
      Effect.fail(new StakingPoolCheckFailed({ network: "mainnet", cause: new Error("rpc down") })),
    );

    await expect(
      owner.createValidator({
        nodeId: node.id,
        accountId: "approved.poolv1.near",
        network: "mainnet",
      }),
    ).rejects.toMatchObject({
      code: "CONNECTION_ERROR",
      data: { errorCode: "STAKING_POOL_CHECK_FAILED", suggestion: "Try again in a moment" },
    });
    expect(await owner.listValidators({ nodeId: node.id })).toEqual([]);
  });

  it("rejects a malformed account without checking the whitelist", async () => {
    const { owner, node } = await seedNode();

    await expect(
      owner.createValidator({ nodeId: node.id, accountId: "Not An Account", network: "mainnet" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(pools.isApproved).not.toHaveBeenCalled();
  });

  it.each([
    "NEAR",
    " near",
  ])("checks NEAR validators whatever the protocol's case or spacing: %j", async (protocol) => {
    const { owner, node } = await seedNode();
    approve(false);

    await expect(
      owner.createValidator({
        nodeId: node.id,
        accountId: "not-a-pool.near",
        network: "mainnet",
        protocol,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(pools.isApproved).toHaveBeenCalledWith("not-a-pool.near", "mainnet");
  });

  it("doesn't check validators on other protocols", async () => {
    const { owner, node } = await seedNode();

    await expect(
      owner.createValidator({
        nodeId: node.id,
        accountId: "validator-on-other-chain",
        network: "mainnet",
        protocol: "other",
      }),
    ).resolves.toMatchObject({ protocol: "other" });
    expect(pools.isApproved).not.toHaveBeenCalled();
  });

  it("checks an update only when the account or network changes", async () => {
    const { owner, node } = await seedNode();
    approve(true);
    const validator = await owner.createValidator({
      nodeId: node.id,
      accountId: "approved.poolv1.near",
      network: "mainnet",
    });
    pools.isApproved.mockReset();

    await expect(
      owner.updateValidator({ validatorId: validator.id, role: "community" }),
    ).resolves.toMatchObject({ role: "community" });
    expect(pools.isApproved).not.toHaveBeenCalled();

    approve(false);
    await expect(
      owner.updateValidator({ validatorId: validator.id, accountId: "not-a-pool.near" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(pools.isApproved).toHaveBeenCalledWith("not-a-pool.near", "mainnet");

    approve(false);
    await expect(
      owner.updateValidator({ validatorId: validator.id, network: "testnet" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(pools.isApproved).toHaveBeenLastCalledWith("approved.poolv1.near", "testnet");
  });

  it("won't make an entry that isn't an approved pool the default", async () => {
    const { owner, node } = await seedNode();
    approve(true);
    const validator = await owner.createValidator({
      nodeId: node.id,
      accountId: "delisted.poolv1.near",
      network: "mainnet",
    });

    approve(false);
    await expect(owner.setDefaultValidator({ validatorId: validator.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      owner.updateValidator({ validatorId: validator.id, isDefault: true }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(await owner.listValidators({ nodeId: node.id })).toEqual([
      expect.objectContaining({ id: validator.id, isDefault: false }),
    ]);

    approve(true);
    await expect(owner.setDefaultValidator({ validatorId: validator.id })).resolves.toMatchObject({
      isDefault: true,
    });
  });

  it("reports approval publicly for the stake flow", async () => {
    const publicClient = await getPluginClient();

    approve(true);
    await expect(
      publicClient.getStakingPoolApproval({
        accountId: "approved.poolv1.near",
        network: "mainnet",
      }),
    ).resolves.toEqual({ approved: true });

    approve(false);
    await expect(
      publicClient.getStakingPoolApproval({ accountId: "not-a-pool.near", network: "mainnet" }),
    ).resolves.toEqual({ approved: false });
  });
});
