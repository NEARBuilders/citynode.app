import { Effect } from "effect";
import { afterAll, describe, expect, it, vi } from "vitest";
import { daoContext, getPluginClient, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

afterAll(async () => {
  await teardown();
});

async function daoCommunity(daoAccountId: string) {
  const id = crypto.randomUUID().slice(0, 8);
  const owner = await getPluginClient(daoContext(`dao-owner-${id}`, `dao-org-${id}`, daoAccountId));
  const tenant = await owner.createTenant({ name: "DAO city", accountId: daoAccountId });
  const node = await owner.createNode({
    name: "DAO city",
    slug: `dao-city-${id}`,
    kind: "city",
    tenantId: tenant.id,
  });
  return { owner, tenantId: tenant.id, nodeId: node.id };
}

describe("public Node DAO", () => {
  it("returns the DAO that owns the community, signed out", async () => {
    const dao = `nd-${crypto.randomUUID().slice(0, 8)}.sputnik-dao.near`;
    const { nodeId } = await daoCommunity(dao);

    const visitor = await getPluginClient();
    expect(await visitor.getNodeDao({ nodeId })).toEqual({
      daoAccountId: dao,
      network: "mainnet",
    });
  });

  it("follows a changed owner account on the next read, keeping nothing from before", async () => {
    const before = `nd-${crypto.randomUUID().slice(0, 8)}.sputnik-dao.near`;
    const after = `nd-${crypto.randomUUID().slice(0, 8)}.sputnik-dao.near`;
    const { owner, tenantId, nodeId } = await daoCommunity(before);
    const visitor = await getPluginClient();
    expect((await visitor.getNodeDao({ nodeId })).daoAccountId).toBe(before);

    await owner.updateTenant({ tenantId, accountId: after });

    expect(await visitor.getNodeDao({ nodeId })).toEqual({
      daoAccountId: after,
      network: "mainnet",
    });
  });

  it("reads the network from a testnet account", async () => {
    const dao = `nd-${crypto.randomUUID().slice(0, 8)}.sputnik-dao.testnet`;
    const { nodeId } = await daoCommunity(dao);

    expect(await (await getPluginClient()).getNodeDao({ nodeId })).toEqual({
      daoAccountId: dao,
      network: "testnet",
    });
  });

  it("has no DAO for an unknown community", async () => {
    expect(await (await getPluginClient()).getNodeDao({ nodeId: crypto.randomUUID() })).toEqual({
      daoAccountId: null,
      network: null,
    });
  });
});
