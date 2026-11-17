import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { activateTestNode, daoContext, getPluginClient, teardown } from "../setup";

vi.mock("@/services/staking-pools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/staking-pools")>()),
  makeStakingPools: () => ({ isApproved: () => Effect.succeed(true) }),
}));

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

const ORG = "node-generalization-org";

describe("generalized node model", () => {
  beforeAll(async () => {
    await getPluginClient();
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  it("reserves the platform kind on update", async () => {
    const org = await getPluginClient(
      daoContext("activate-platform-kind", ORG, "activate-platform.near"),
    );
    const suffix = crypto.randomUUID().slice(0, 8);
    const tenant = await org.createTenant({
      name: "Platform Kind",
      accountId: `activate-platform-${suffix}.near`,
    });
    const { node } = await activateTestNode({
      kind: "city",
      slug: `standalone-${suffix}`,
      name: "Standalone",
      tenantId: tenant.id,
      orgId: ORG,
    });
    await expect(org.updateNode({ nodeId: node.id, kind: "platform" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("attaches an activated place to an org-owned tenant", async () => {
    const org = await getPluginClient(
      daoContext("activate-tenant-owner", ORG, "activate-tenant.near"),
    );
    const suffix = crypto.randomUUID().slice(0, 8);

    const tenant = await org.createTenant({
      name: "Activated Tenant",
      accountId: `activate-tenant-${suffix}.near`,
    });
    const { node } = await activateTestNode({
      kind: "community",
      slug: `activate-community-${suffix}`,
      name: "Activated Community",
      tenantId: tenant.id,
      orgId: ORG,
    });

    expect(node).toMatchObject({
      kind: "community",
      tenantId: tenant.id,
      placeId: expect.any(String),
    });
  });

  it("lists a node's own validators and its ancestors", async () => {
    const admin = await getPluginClient(
      daoContext("activate-staking-owner", ORG, "activate-staking.near"),
    );
    const suffix = crypto.randomUUID().slice(0, 8);
    const tenant = await admin.createTenant({
      name: "Staking Tenant",
      accountId: `activate-staking-${suffix}.near`,
    });

    const { node: root, place: rootPlace } = await activateTestNode({
      kind: "zone",
      slug: `staking-zone-${suffix}`,
      name: "Staking Zone",
      tenantId: tenant.id,
      orgId: ORG,
    });
    const { node: child } = await activateTestNode({
      kind: "user",
      slug: `staking-user-${suffix}`,
      name: "Staking User",
      parentPlaceId: rootPlace.id,
      tenantId: tenant.id,
      orgId: ORG,
    });
    await admin.createValidator({
      nodeId: child.id,
      accountId: `staking-pool-${suffix}.near`,
      network: "mainnet",
      protocol: "near",
      role: "official",
    });

    expect(await admin.listValidatorsByNode({ nodeId: child.id })).toHaveLength(1);
    expect(await admin.listValidatorsByNode({ nodeId: root.id })).toEqual([]);
    expect(await admin.listNodeAncestors({ nodeId: child.id })).toEqual([
      expect.objectContaining({ id: root.id }),
    ]);
  });

  it("includes tenant-attached activated places in listTenantApps", async () => {
    const org = await getPluginClient(daoContext("activate-apps-owner", ORG, "activate-apps.near"));
    const suffix = crypto.randomUUID().slice(0, 8);

    const tenant = await org.createTenant({
      name: "Apps Tenant",
      accountId: `activate-apps-${suffix}.near`,
    });
    await activateTestNode({
      kind: "community",
      slug: `activate-apps-node-${suffix}`,
      name: "Apps Community",
      tenantId: tenant.id,
      orgId: ORG,
    });

    const apps = await org.listTenantApps();
    const app = apps.find((entry) => entry.accountId === `activate-apps-${suffix}.near`);
    expect(app?.node).toMatchObject({ kind: "community", name: "Apps Community" });
  });
});
