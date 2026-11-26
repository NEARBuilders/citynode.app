import { Effect } from "effect";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { isExplicitDaoMember } from "@/services/dao";
import {
  activateTestNode,
  authedContext,
  daoContext,
  getPluginClient,
  orgContext,
  teardown,
} from "../setup";

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

afterEach(() => {
  vi.mocked(isExplicitDaoMember).mockReturnValue(true);
});

describe("Tenant + Node + Binding wizard flow", () => {
  beforeAll(async () => {
    await getPluginClient(orgContext());
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  describe("full chain: createTenant → activate → createBinding", () => {
    it("creates a tenant, activates a root place, and adds a primary binding", async () => {
      const ctx = daoContext("wizard-user-1", "org-wizard-1", "admin-wizard-1.near");
      const c = await getPluginClient(ctx);

      const tenant = await c.createTenant({
        name: "Chicago City Node",
        accountId: "chicago-wizard.example.near",
        status: "active",
      });
      expect(tenant.orgId).toBe("org-wizard-1");

      const { node } = await activateTestNode({
        kind: "country",
        slug: "chicago-wiz",
        name: "Chicago",
        tenantId: tenant.id,
        orgId: "org-wizard-1",
      });
      expect(node).toMatchObject({
        kind: "country",
        slug: "chicago-wiz",
        parentId: null,
        tenantId: tenant.id,
        placeId: expect.any(String),
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
        isVerified: true,
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
      const ctx = daoContext("wizard-user-2", "org-wizard-2", "admin-wizard-2.near");
      const c = await getPluginClient(ctx);

      const tenantA = await c.createTenant({
        name: "First City",
        accountId: "first-wizard.example.near",
        status: "active",
      });
      await activateTestNode({
        kind: "country",
        slug: "dup-city",
        name: "Dup City",
        tenantId: tenantA.id,
        orgId: "org-wizard-2",
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
      const { node: nodeB } = await activateTestNode({
        kind: "country",
        slug: "dup-city-clone",
        name: "Dup City Clone",
        tenantId: tenantB.id,
        orgId: "org-wizard-2",
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
      const ctx = daoContext("wizard-user-3", "org-wizard-3", "admin-wizard-3.near");
      const c = await getPluginClient(ctx);

      const tenant = await c.createTenant({
        name: "Nested Hierarchy",
        accountId: "nested-wizard.example.near",
        status: "active",
      });

      const { node: country, place: countryPlace } = await activateTestNode({
        kind: "country",
        slug: "nested-usa",
        name: "USA",
        tenantId: tenant.id,
        orgId: "org-wizard-3",
      });
      const countryBinding = await c.createBinding({
        tenantId: tenant.id,
        hostname: "nested-usa.citynode.app",
        isPrimary: true,
      });
      expect(countryBinding.isPrimary).toBe(true);

      const { node: state, place: statePlace } = await activateTestNode({
        kind: "state",
        slug: "nested-illinois",
        name: "Illinois",
        parentPlaceId: countryPlace.id,
        tenantId: tenant.id,
        orgId: "org-wizard-3",
      });
      const stateBinding = await c.createBinding({
        tenantId: tenant.id,
        hostname: "nested-illinois.citynode.app",
        isPrimary: false,
      });
      expect(stateBinding.isPrimary).toBe(false);

      await activateTestNode({
        kind: "city",
        slug: "nested-chicago",
        name: "Chicago",
        parentPlaceId: statePlace.id,
        tenantId: tenant.id,
        orgId: "org-wizard-3",
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
      const ctx = daoContext("wizard-user-4", "org-wizard-4", "admin-wizard-4.near");
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
      await activateTestNode({
        kind: "country",
        slug: "preflight-city",
        name: "Preflight City",
        tenantId: tenant.id,
        orgId: "org-wizard-4",
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

  describe("listTenantApps discovery", () => {
    it("lists active tenants with primary hostname and node, excluding non-active and binding-less rows", async () => {
      const c = await getPluginClient(
        daoContext("discovery-user-1", "org-discovery-1", "admin-discovery-1.near"),
      );
      const publicClient = await getPluginClient();

      const active = await c.createTenant({
        name: "Discovery Active",
        accountId: "discovery-active.example.near",
        status: "active",
      });
      const { node: activeNode } = await activateTestNode({
        kind: "city",
        slug: "discovery-active",
        name: "Discovery Active",
        tenantId: active.id,
        orgId: "org-discovery-1",
      });
      await c.createBinding({
        tenantId: active.id,
        hostname: "discovery-active.citynode.app",
        isPrimary: true,
      });
      expect(activeNode.slug).toBe("discovery-active");

      const bindingless = await c.createTenant({
        name: "Discovery Bindingless",
        accountId: "discovery-bindingless.example.near",
        status: "active",
      });
      await activateTestNode({
        kind: "country",
        slug: "discovery-bindingless",
        name: "Discovery Bindingless",
        tenantId: bindingless.id,
        orgId: "org-discovery-1",
      });

      const pending = await c.createTenant({
        name: "Discovery Pending",
        accountId: "discovery-pending.example.near",
        status: "pending",
      });
      await activateTestNode({
        kind: "country",
        slug: "discovery-pending",
        name: "Discovery Pending",
        tenantId: pending.id,
        orgId: "org-discovery-1",
      });

      const apps = await publicClient.listTenantApps();
      const byAccount = new Map(apps.map((app) => [app.accountId, app]));

      const activeApp = byAccount.get("discovery-active.example.near");
      expect(activeApp).toMatchObject({
        name: "Discovery Active",
        status: "active",
        hostname: "discovery-active.citynode.app",
        node: { slug: "discovery-active", kind: "city", name: "Discovery Active" },
      });

      const bindinglessApp = byAccount.get("discovery-bindingless.example.near");
      expect(bindinglessApp).toMatchObject({
        status: "active",
        hostname: null,
        node: { slug: "discovery-bindingless" },
      });

      expect(byAccount.has("discovery-pending.example.near")).toBe(false);

      expect(activeApp?.ownerKind).toBe("dao");
    });

    it("returns one row per tenant even when multiple nodes reference it", async () => {
      const c = await getPluginClient(
        daoContext("discovery-user-2", "org-discovery-2", "admin-discovery-2.near"),
      );
      const publicClient = await getPluginClient();

      const tenant = await c.createTenant({
        name: "Discovery Multi Node",
        accountId: "discovery-multi.example.near",
        status: "active",
      });
      await activateTestNode({
        kind: "country",
        slug: "discovery-multi",
        name: "Discovery Multi",
        tenantId: tenant.id,
        orgId: "org-discovery-2",
      });
      await activateTestNode({
        kind: "state",
        slug: "discovery-multi-child",
        name: "Discovery Multi Child",
        tenantId: tenant.id,
        orgId: "org-discovery-2",
      });

      const apps = await publicClient.listTenantApps();
      const rows = apps.filter((app) => app.accountId === "discovery-multi.example.near");
      expect(rows).toHaveLength(1);
    });
  });

  describe("stake community scoping", () => {
    const organizations = [
      { id: "org-stake-scope-a", role: "owner" },
      { id: "org-stake-scope-b", role: "member" },
    ];
    const accounts = {
      active: "stake-scope-active.example.near",
      connected: "stake-scope-connected.example.near",
      unrelated: "stake-scope-unrelated.example.near",
    };

    beforeAll(async () => {
      const fixtures = [
        {
          userId: "stake-scope-owner-a",
          organizationId: organizations[0]!.id,
          accountId: accounts.active,
          slug: "stake-scope-active",
        },
        {
          userId: "stake-scope-owner-b",
          organizationId: organizations[1]!.id,
          accountId: accounts.connected,
          slug: "stake-scope-connected",
        },
        {
          userId: "stake-scope-owner-c",
          organizationId: "org-stake-scope-c",
          accountId: accounts.unrelated,
          slug: "stake-scope-unrelated",
        },
      ];

      for (const fixture of fixtures) {
        const client = await getPluginClient(
          daoContext(fixture.userId, fixture.organizationId, `${fixture.slug}.near`),
        );
        const tenant = await client.createTenant({
          name: fixture.slug,
          accountId: fixture.accountId,
          status: "active",
        });
        const { node } = await activateTestNode({
          kind: "community",
          slug: fixture.slug,
          name: fixture.slug,
          tenantId: tenant.id,
          orgId: fixture.organizationId,
        });
        if (fixture.accountId === accounts.active) {
          await client.createValidator({
            nodeId: node.id,
            accountId: "stake-scope-validator.near",
            role: "community",
            isDefault: true,
          });
        }
      }
    });

    it("flags which communities can be staked to", async () => {
      const results = await (await getPluginClient()).listStakeCommunities();
      const stakeable = Object.fromEntries(
        results.map((result) => [result.accountId, result.stakeable]),
      );

      expect(stakeable[accounts.active]).toBe(true);
      expect(stakeable[accounts.connected]).toBe(false);
      expect(stakeable[accounts.unrelated]).toBe(false);
    });

    it("keeps the full directory for anonymous visitors", async () => {
      const client = await getPluginClient();
      const results = await client.listStakeCommunities();
      const resultAccounts = new Set(results.map((result) => result.accountId));

      expect(resultAccounts.has(accounts.active)).toBe(true);
      expect(resultAccounts.has(accounts.connected)).toBe(true);
      expect(resultAccounts.has(accounts.unrelated)).toBe(true);
    });

    it("lists every community with the active organization's first", async () => {
      const client = await getPluginClient({
        ...orgContext("stake-scope-member", organizations[0]!.id),
        organizations,
      });
      const results = await client.listStakeCommunities();
      const resultAccounts = results.map((result) => result.accountId);

      expect(resultAccounts.slice(0, 2)).toEqual([accounts.active, accounts.connected]);
      expect(resultAccounts).toContain(accounts.unrelated);
      expect(results[0]?.viewerMembership).toBe("active");
      expect(results[1]?.viewerMembership).toBe("member");
      expect(
        results.find((result) => result.accountId === accounts.unrelated)?.viewerMembership,
      ).toBeNull();
    });

    it("puts every connected organization first when none is active", async () => {
      const client = await getPluginClient({
        ...authedContext("stake-scope-member"),
        organization: { activeOrganizationId: null },
        organizations,
      });
      const results = await client.listStakeCommunities();

      expect(
        results
          .slice(0, 2)
          .map((result) => result.accountId)
          .sort(),
      ).toEqual([accounts.active, accounts.connected].sort());
      expect(results.slice(0, 2).every((result) => result.viewerMembership === "member")).toBe(
        true,
      );
      expect(results.map((result) => result.accountId)).toContain(accounts.unrelated);
    });

    it("lists every community for a viewer whose only organization is personal", async () => {
      const personal = { id: "org-stake-scope-personal", role: "owner" };
      const client = await getPluginClient({
        ...orgContext("stake-scope-solo", personal.id),
        organizations: [personal],
      });
      const results = await client.listStakeCommunities();
      const resultAccounts = new Set(results.map((result) => result.accountId));

      expect(resultAccounts.has(accounts.active)).toBe(true);
      expect(resultAccounts.has(accounts.connected)).toBe(true);
      expect(resultAccounts.has(accounts.unrelated)).toBe(true);
      expect(results.every((result) => result.viewerMembership === null)).toBe(true);
      const names = results.map((result) => result.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it("keeps tenant organization ids out of the public tenant directory", async () => {
      const apps = await (await getPluginClient()).listTenantApps();
      const app = apps.find((entry) => entry.accountId === accounts.active);
      expect(app).toBeDefined();
      expect(app).not.toHaveProperty("orgId");
    });
  });
});
