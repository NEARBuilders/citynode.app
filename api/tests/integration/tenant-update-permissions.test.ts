import { Effect } from "effect";
import { afterAll, describe, expect, it, vi } from "vitest";
import { authedContext, daoContext, getPluginClient, orgContext, teardown } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));
afterAll(teardown);

const platformGrants = [
  ["accountId", { accountId: "someone-else.near" }],
  ["allowUiOverrides", { allowUiOverrides: true }],
  ["allowBackendOverrides", { allowBackendOverrides: true }],
  ["allowSsr", { allowSsr: true }],
] as const;

async function daoTenantFixture() {
  const id = crypto.randomUUID();
  const org = `grants-${id}`;
  const accountId = `g-${id}.near`;
  const platform = await getPluginClient(daoContext(id, org, accountId, "owner"));
  const tenant = await platform.createTenant({ name: "DAO city", accountId });
  return {
    tenant,
    accountId,
    platform,
    owner: await getPluginClient(orgContext(`owner-${id}`, org, "owner")),
  };
}

async function spawnedTenantFixture() {
  const id = crypto.randomUUID();
  const accountId = `spawn-${id}.near`;
  const userId = `spawn-user-${id}`;
  const context = { ...authedContext(userId), near: { primaryAccountId: accountId } };
  const spawner = await getPluginClient(context);
  const { tenant } = await spawner.spawnTenant({
    name: "Spawned app",
    hostname: `s-${id}.citynode.app`,
  });
  const owner = await getPluginClient(
    orgContext(userId, `spawn-org-${id}`, "owner", undefined, accountId),
  );
  return { tenant, accountId, owner };
}

describe("updateTenant platform grants", () => {
  describe("DAO-owned tenant", () => {
    it.each(platformGrants)("refuses an owner changing %s", async (_field, patch) => {
      const { tenant, accountId, owner } = await daoTenantFixture();

      await expect(owner.updateTenant({ tenantId: tenant.id, ...patch })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      const { tenant: unchanged } = await owner.getSpawnStatus({ tenantId: tenant.id });
      expect(unchanged).toMatchObject({
        accountId,
        allowUiOverrides: tenant.allowUiOverrides,
        allowBackendOverrides: tenant.allowBackendOverrides,
        allowSsr: tenant.allowSsr,
      });
    });

    it("still lets an owner rename the tenant", async () => {
      const { tenant, accountId, owner } = await daoTenantFixture();

      expect(await owner.updateTenant({ tenantId: tenant.id, name: "Renamed" })).toMatchObject({
        name: "Renamed",
        accountId,
      });
    });

    it("lets a platform admin change the account and the flags", async () => {
      const { tenant, platform } = await daoTenantFixture();

      const updated = await platform.updateTenant({
        tenantId: tenant.id,
        allowUiOverrides: true,
        allowBackendOverrides: true,
        allowSsr: true,
      });

      expect(updated).toMatchObject({
        allowUiOverrides: true,
        allowBackendOverrides: true,
        allowSsr: true,
      });
    });
  });

  describe("spawned tenant", () => {
    it.each(platformGrants)("refuses its owner changing %s", async (_field, patch) => {
      const { tenant, accountId, owner } = await spawnedTenantFixture();

      await expect(owner.updateTenant({ tenantId: tenant.id, ...patch })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });

      const { tenant: unchanged } = await owner.getSpawnStatus({ tenantId: tenant.id });
      expect(unchanged).toMatchObject({
        accountId,
        allowUiOverrides: tenant.allowUiOverrides,
        allowBackendOverrides: false,
        allowSsr: false,
      });
    });

    it("still lets its owner rename it", async () => {
      const { tenant, accountId, owner } = await spawnedTenantFixture();

      expect(await owner.updateTenant({ tenantId: tenant.id, name: "Renamed app" })).toMatchObject({
        name: "Renamed app",
        accountId,
      });
    });
  });
});
