import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPluginClient, orgContext, teardown } from "../setup";

describe("Tenant + Node + Binding wizard flow", () => {
  beforeAll(async () => {
    await getPluginClient(orgContext());
  });

  afterAll(async () => {
    await teardown();
  });

  describe("full chain: createTenant → createNode → createBinding", () => {
    it("creates a tenant, root country node, and primary binding in sequence", async () => {
      const ctx = orgContext("wizard-user-1", "org-wizard-1");
      const c = await getPluginClient(ctx);

      const tenant = await c.createTenant({
        name: "Chicago City Node",
        accountId: "chicago-wizard.example.near",
        status: "active",
      });
      expect(tenant.orgId).toBe("org-wizard-1");

      const node = await c.createNode({
        kind: "country",
        slug: "chicago-wiz",
        name: "Chicago",
        parentId: null,
        tenantId: tenant.id,
      });
      expect(node).toMatchObject({
        kind: "country",
        slug: "chicago-wiz",
        parentId: null,
        tenantId: tenant.id,
      });

      const preflight = await c.bindingPreflight({ hostname: "chicago-wiz.citynode.app" });
      expect(preflight.hostname.available).toBe(true);

      const binding = await c.createBinding({
        tenantId: tenant.id,
        hostname: "chicago-wiz.citynode.app",
        isPrimary: true,
      });
      expect(binding).toMatchObject({
        tenantId: tenant.id,
        hostname: "chicago-wiz.citynode.app",
        isPrimary: true,
        isVerified: false,
      });

      const postPreflight = await c.bindingPreflight({ hostname: "chicago-wiz.citynode.app" });
      expect(postPreflight.hostname.available).toBe(false);

      const bindings = await c.listTenantBindingsForTenant({ tenantId: tenant.id });
      expect(bindings).toHaveLength(1);
      expect(bindings[0]?.hostname).toBe("chicago-wiz.citynode.app");
    });
  });

  describe("rollback on duplicate hostname", () => {
    it("cleans up node and tenant when binding creation fails on a duplicate hostname", async () => {
      const ctx = orgContext("wizard-user-2", "org-wizard-2");
      const c = await getPluginClient(ctx);

      const tenantA = await c.createTenant({
        name: "First City",
        accountId: "first-wizard.example.near",
        status: "active",
      });
      await c.createNode({
        kind: "country",
        slug: "dup-city",
        name: "Dup City",
        parentId: null,
        tenantId: tenantA.id,
      });
      await c.createBinding({
        tenantId: tenantA.id,
        hostname: "dup-city.citynode.app",
        isPrimary: true,
      });

      const tenantB = await c.createTenant({
        name: "Second City",
        accountId: "second-wizard.example.near",
        status: "active",
      });
      const nodeB = await c.createNode({
        kind: "country",
        slug: "dup-city-clone",
        name: "Dup City Clone",
        parentId: null,
        tenantId: tenantB.id,
      });

      await expect(
        c.createBinding({
          tenantId: tenantB.id,
          hostname: "dup-city.citynode.app",
          isPrimary: true,
        }),
      ).rejects.toThrow("Hostname already in use");

      const adminCtx = orgContext("wizard-user-2", "org-wizard-2", "admin");
      const adminClient = await getPluginClient(adminCtx);
      await adminClient.deleteNode({ nodeId: nodeB.id });

      const ownerCtx = orgContext("wizard-user-2", "org-wizard-2", "owner");
      const ownerClient = await getPluginClient(ownerCtx);
      const deletedTenant = await ownerClient.deleteTenant({ tenantId: tenantB.id });
      expect(deletedTenant.status).toBe("pending_deletion");
      expect(deletedTenant.deletedAt).toBeTruthy();
    });
  });

  describe("nested hierarchy: country → state → city", () => {
    it("creates a three-level node tree, each with its own binding", async () => {
      const ctx = orgContext("wizard-user-3", "org-wizard-3");
      const c = await getPluginClient(ctx);

      const tenant = await c.createTenant({
        name: "Nested Hierarchy",
        accountId: "nested-wizard.example.near",
        status: "active",
      });

      const country = await c.createNode({
        kind: "country",
        slug: "nested-usa",
        name: "USA",
        parentId: null,
        tenantId: tenant.id,
      });
      const countryBinding = await c.createBinding({
        tenantId: tenant.id,
        hostname: "nested-usa.citynode.app",
        isPrimary: true,
      });
      expect(countryBinding.isPrimary).toBe(true);

      const state = await c.createNode({
        kind: "state",
        slug: "nested-illinois",
        name: "Illinois",
        parentId: country.id,
        tenantId: tenant.id,
      });
      const stateBinding = await c.createBinding({
        tenantId: tenant.id,
        hostname: "nested-illinois.citynode.app",
        isPrimary: false,
      });
      expect(stateBinding.isPrimary).toBe(false);

      await c.createNode({
        kind: "city",
        slug: "nested-chicago",
        name: "Chicago",
        parentId: state.id,
        tenantId: tenant.id,
      });
      const cityBinding = await c.createBinding({
        tenantId: tenant.id,
        hostname: "nested-chicago.citynode.app",
        isPrimary: false,
      });
      expect(cityBinding.hostname).toBe("nested-chicago.citynode.app");

      const children = await c.listChildren({ nodeId: country.id });
      expect(children.map((n) => n.slug)).toContain("nested-illinois");

      const grandchildren = await c.listChildren({ nodeId: state.id });
      expect(grandchildren.map((n) => n.slug)).toEqual(["nested-chicago"]);

      const bindings = await c.listTenantBindingsForTenant({ tenantId: tenant.id });
      expect(bindings).toHaveLength(3);
      const primaryBindings = bindings.filter((b) => b.isPrimary);
      expect(primaryBindings).toHaveLength(1);
      expect(primaryBindings[0]?.hostname).toBe("nested-usa.citynode.app");
    });
  });

  describe("bindingPreflight across the wizard", () => {
    it("reports available before creation and unavailable after", async () => {
      const ctx = orgContext("wizard-user-4", "org-wizard-4");
      const c = await getPluginClient(ctx);

      const hostname = "preflight-city.citynode.app";

      const before = await c.bindingPreflight({ hostname });
      expect(before.hostname.available).toBe(true);
      expect(before.hostname.format).toBe("valid");

      const tenant = await c.createTenant({
        name: "Preflight City",
        accountId: "preflight-wizard.example.near",
        status: "active",
      });
      await c.createNode({
        kind: "country",
        slug: "preflight-city",
        name: "Preflight City",
        parentId: null,
        tenantId: tenant.id,
      });
      await c.createBinding({
        tenantId: tenant.id,
        hostname,
        isPrimary: true,
      });

      const after = await c.bindingPreflight({ hostname });
      expect(after.hostname.available).toBe(false);
    });

    it("rejects invalid hostname format in preflight", async () => {
      const c = await getPluginClient(orgContext("wizard-user-5", "org-wizard-5"));
      const result = await c.bindingPreflight({ hostname: "NOT A VALID HOST" });
      expect(result.hostname.format).toBe("invalid");
      expect(result.hostname.available).toBe(false);
    });
  });
});
