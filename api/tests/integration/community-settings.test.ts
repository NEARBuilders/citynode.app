import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { authedContext, daoContext, getPluginClient, orgContext } from "../setup";

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

describe("community settings authorization", () => {
  it("filters settings reads by role and tenant organization while preserving public discovery", async () => {
    const orgId = `settings-${crypto.randomUUID()}`;
    const owner = await getPluginClient(daoContext("settings-owner", orgId, "settings.near"));
    const tenant = await owner.createTenant({
      name: "Private settings",
      accountId: `${crypto.randomUUID().slice(0, 8)}.near`,
    });
    await owner.createBinding({
      tenantId: tenant.id,
      hostname: `${crypto.randomUUID().slice(0, 8)}.citynode.app`,
    });
    for (const context of [
      orgContext("member", orgId, "member"),
      orgContext("outsider", "other-org", "owner"),
      authedContext("orgless"),
    ]) {
      const client = await getPluginClient(context);
      expect(await client.listTenants()).not.toContainEqual(
        expect.objectContaining({ id: tenant.id }),
      );
      await expect(
        client.listTenantBindingsForTenant({ tenantId: tenant.id }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        client.createBinding({ tenantId: tenant.id, hostname: "forbidden.citynode.app" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    for (const context of [
      orgContext("owner", orgId, "owner"),
      orgContext("admin", orgId, "admin"),
      authedContext("platform", "admin"),
    ]) {
      const client = await getPluginClient(context);
      expect(await client.listTenants()).toContainEqual(expect.objectContaining({ id: tenant.id }));
      expect(await client.listTenantBindingsForTenant({ tenantId: tenant.id })).toHaveLength(1);
    }
    const publicClient = await getPluginClient();
    await expect(publicClient.listTenants()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const publicTenant = await publicClient.resolveTenant({ accountId: tenant.accountId });
    expect(publicTenant).toMatchObject({ id: tenant.id });
    for (const key of ["ownerUserId", "allowUiOverrides", "allowBackendOverrides", "allowSsr"]) {
      expect(publicTenant).not.toHaveProperty(key);
    }
  });
});
