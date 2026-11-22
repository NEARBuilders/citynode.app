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

async function fixture() {
  const id = crypto.randomUUID();
  const org = `status-${id}`;
  const platform = await getPluginClient(daoContext(id, org, `s-${id}.near`, "admin"));
  const tenant = await platform.createTenant({ name: "Status city", accountId: `s-${id}.near` });
  return {
    tenant,
    platform,
    orgAdmin: await getPluginClient(orgContext(`admin-${id}`, org, "admin")),
    owner: await getPluginClient(orgContext(`owner-${id}`, org, "owner")),
    statusOf: async () =>
      (await (await getPluginClient()).resolveTenantById({ tenantId: tenant.id }))?.status,
  };
}

describe("tenant status transitions", () => {
  it("lets only a platform admin lift a suspension", async () => {
    const { tenant, platform, orgAdmin, owner, statusOf } = await fixture();

    await platform.suspendTenant({ tenantId: tenant.id });
    expect(await statusOf()).toBe("suspended");

    await expect(orgAdmin.reactivateTenant({ tenantId: tenant.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(owner.reactivateTenant({ tenantId: tenant.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await statusOf()).toBe("suspended");

    const restored = await platform.reactivateTenant({ tenantId: tenant.id });
    expect(restored.status).toBe("active");
  });

  it("does not let an organization admin undo a suspension a platform admin set", async () => {
    const { tenant, platform, orgAdmin, statusOf } = await fixture();

    await platform.suspendTenant({ tenantId: tenant.id });
    await expect(orgAdmin.reactivateTenant({ tenantId: tenant.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(await statusOf()).toBe("suspended");
  });

  it("does not let organization admins or owners reactivate a tenant pending deletion", async () => {
    const { tenant, orgAdmin, owner, statusOf } = await fixture();

    const deleted = await owner.deleteTenant({ tenantId: tenant.id });
    expect(deleted.status).toBe("pending_deletion");
    expect(deleted.deletedAt).toEqual(expect.any(String));

    await expect(orgAdmin.reactivateTenant({ tenantId: tenant.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(owner.reactivateTenant({ tenantId: tenant.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(await statusOf()).toBe("pending_deletion");
  });

  it("clears the deletion timestamp when a platform admin restores a tenant", async () => {
    const { tenant, platform, owner } = await fixture();
    await owner.deleteTenant({ tenantId: tenant.id });

    const restored = await platform.reactivateTenant({ tenantId: tenant.id });

    expect(restored.status).toBe("active");
    expect(restored.deletedAt).toBeNull();
  });

  it("rejects reactivating a tenant that is not suspended or pending deletion", async () => {
    const { tenant, platform } = await fixture();

    await expect(platform.reactivateTenant({ tenantId: tenant.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("reports a missing tenant when reactivating", async () => {
    const platform = await getPluginClient(authedContext("status-platform-admin", "admin"));

    await expect(
      platform.reactivateTenant({ tenantId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("does not let a suspension replace a pending deletion", async () => {
    const { tenant, orgAdmin, owner, statusOf } = await fixture();
    await owner.deleteTenant({ tenantId: tenant.id });

    await expect(orgAdmin.suspendTenant({ tenantId: tenant.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await statusOf()).toBe("pending_deletion");
  });

  it("treats suspending an already suspended tenant as a no-op", async () => {
    const { tenant, orgAdmin } = await fixture();
    await orgAdmin.suspendTenant({ tenantId: tenant.id });

    const again = await orgAdmin.suspendTenant({ tenantId: tenant.id });

    expect(again.status).toBe("suspended");
  });

  it("ignores a status sent through updateTenant by a community owner", async () => {
    const { tenant, platform, owner, statusOf } = await fixture();
    await platform.suspendTenant({ tenantId: tenant.id });

    const updated = await owner.updateTenant({
      tenantId: tenant.id,
      name: "Renamed city",
      status: "active",
    } as Parameters<typeof owner.updateTenant>[0]);

    expect(updated.name).toBe("Renamed city");
    expect(updated.status).toBe("suspended");
    expect(await statusOf()).toBe("suspended");
  });

  it("keeps the tenant active when an owner sends a pending-deletion status", async () => {
    const { tenant, owner } = await fixture();

    const updated = await owner.updateTenant({
      tenantId: tenant.id,
      status: "pending_deletion",
    } as Parameters<typeof owner.updateTenant>[0]);

    expect(updated.status).toBe("active");
    expect(updated.deletedAt).toBeNull();
  });
});
