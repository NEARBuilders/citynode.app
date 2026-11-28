import { afterAll, describe, expect, it } from "vitest";
import { authedContext, getPluginClient, orgContext, teardown } from "../setup";

afterAll(teardown);

async function fixture() {
  const id = crypto.randomUUID().slice(0, 8);
  const accountId = `bind-${id}.near`;
  const userId = `bind-user-${id}`;
  const spawner = await getPluginClient({
    ...authedContext(userId),
    near: { primaryAccountId: accountId },
  });
  const { tenant, binding: primary } = await spawner.spawnTenant({
    name: "Binding city",
    hostname: `bind-${id}.citynode.app`,
  });
  const owner = await getPluginClient(
    orgContext(userId, `bind-org-${id}`, "owner", undefined, accountId),
  );
  const admin = await getPluginClient(
    orgContext(userId, `bind-org-${id}`, "admin", undefined, accountId),
  );
  return { id, tenant, primary, owner, admin };
}

describe("deleteBinding and the primary domain", () => {
  it("refuses to remove the primary domain while other domains exist", async () => {
    const { id, tenant, primary, owner } = await fixture();
    await owner.createBinding({ tenantId: tenant.id, hostname: `second-${id}.citynode.app` });

    await expect(
      owner.deleteBinding({ tenantId: tenant.id, bindingId: primary.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const bindings = await owner.listTenantBindingsForTenant({ tenantId: tenant.id });
    expect(bindings).toHaveLength(2);
    expect(bindings.filter((binding) => binding.isPrimary)).toHaveLength(1);
  });

  it("removes a non-primary domain and keeps the primary", async () => {
    const { id, tenant, primary, owner } = await fixture();
    const second = await owner.createBinding({
      tenantId: tenant.id,
      hostname: `second-${id}.citynode.app`,
    });

    await owner.deleteBinding({ tenantId: tenant.id, bindingId: second.id });

    expect(await owner.listTenantBindingsForTenant({ tenantId: tenant.id })).toMatchObject([
      { id: primary.id, isPrimary: true },
    ]);
  });

  it("removes the primary domain once another domain has been made primary", async () => {
    const { id, tenant, primary, owner, admin } = await fixture();
    const second = await owner.createBinding({
      tenantId: tenant.id,
      hostname: `second-${id}.citynode.app`,
    });
    await admin.setPrimaryBinding({ tenantId: tenant.id, bindingId: second.id });

    await owner.deleteBinding({ tenantId: tenant.id, bindingId: primary.id });

    expect(await owner.listTenantBindingsForTenant({ tenantId: tenant.id })).toMatchObject([
      { id: second.id, isPrimary: true },
    ]);
  });

  it("still lets the only domain be removed", async () => {
    const { tenant, primary, owner } = await fixture();

    await owner.deleteBinding({ tenantId: tenant.id, bindingId: primary.id });

    expect(await owner.listTenantBindingsForTenant({ tenantId: tenant.id })).toEqual([]);
  });
});
