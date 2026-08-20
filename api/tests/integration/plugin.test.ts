import { describe, expect, it } from "vitest";
import { authedContext, getPluginClient, orgContext } from "../setup";

describe("API Plugin Integration Tests", () => {
  describe("ping", () => {
    it("returns healthy status", async () => {
      const client = await getPluginClient();
      const result = await client.ping();

      expect(result).toEqual({
        status: "ok",
        timestamp: expect.any(String),
      });
    });
  });

  describe("authHealth", () => {
    it("rejects unauthenticated requests", async () => {
      const client = await getPluginClient();
      await expect(client.authHealth()).rejects.toThrow("Authentication required");
    });

    it("returns status when authenticated", async () => {
      const client = await getPluginClient(authedContext());
      const result = await client.authHealth();

      expect(result.status).toBe("ok");
      expect(result.emailConfigured).toEqual(expect.any(Boolean));
      expect(result.smsConfigured).toEqual(expect.any(Boolean));
    });
  });

  describe("resolveTenant", () => {
    it("returns null for an unknown account", async () => {
      const client = await getPluginClient();
      const result = await client.resolveTenant({ accountId: "nobody.near" });
      expect(result).toBeNull();
    });

    it("resolves a tenant created by its owning organization", async () => {
      const client = await getPluginClient(orgContext());

      const created = await client.createTenant({
        name: "Acme Corp",
        accountId: "acme.example.near",
        status: "active",
      });
      expect(created).toMatchObject({
        name: "Acme Corp",
        accountId: "acme.example.near",
        orgId: "org-1",
        status: "active",
      });

      const resolved = await client.resolveTenant({ accountId: "acme.example.near" });
      expect(resolved?.id).toBe(created.id);
    });

    it("rejects invalid accountId format on create", async () => {
      const client = await getPluginClient(orgContext());
      await expect(
        client.createTenant({
          name: "Acme",
          accountId: "NOT-A-VALID-ACCOUNT",
        }),
      ).rejects.toThrow("Invalid accountId format");
    });
  });

  describe("nodes", () => {
    it("creates a root country node and lists root nodes", async () => {
      const client = await getPluginClient(orgContext());

      const tenant = await client.createTenant({
        name: "Country Holder",
        accountId: "countryholder.example.near",
        status: "active",
      });

      const before = await client.listRootNodes();
      expect(before).toEqual([]);

      const created = await client.createNode({
        kind: "country",
        slug: "usa",
        name: "United States",
        parentId: null,
        tenantId: tenant.id,
        metadata: { population: 330_000_000 },
      });
      expect(created).toMatchObject({
        kind: "country",
        slug: "usa",
        name: "United States",
        parentId: null,
        tenantId: tenant.id,
        metadata: { population: 330_000_000 },
      });

      const after = await client.listRootNodes();
      expect(after.map((n) => n.slug)).toEqual(["usa"]);

      const fetched = await client.getNode({ nodeId: created.id });
      expect(fetched?.id).toBe(created.id);
    });

    it("creates a nested node tree (country → state → city)", async () => {
      const client = await getPluginClient(orgContext());

      const tenant = await client.createTenant({
        name: "Tree Holder",
        accountId: "treeholder.example.near",
        status: "active",
      });

      const usa = await client.createNode({
        kind: "country",
        slug: "usa-tree",
        name: "USA",
        parentId: null,
        tenantId: tenant.id,
      });
      const illinois = await client.createNode({
        kind: "state",
        slug: "illinois",
        name: "Illinois",
        parentId: usa.id,
        tenantId: tenant.id,
      });
      const chicago = await client.createNode({
        kind: "city",
        slug: "chicago",
        name: "Chicago",
        parentId: illinois.id,
        tenantId: tenant.id,
      });

      const children = await client.listChildren({ nodeId: illinois.id });
      expect(children.map((c) => c.slug)).toEqual(["chicago"]);

      const resolved = await client.resolveNodeBySlug({ slug: "chicago", parentId: illinois.id });
      expect(resolved?.id).toBe(chicago.id);
    });
  });

  describe("bindingPreflight", () => {
    it("reports availability for a fresh hostname", async () => {
      const client = await getPluginClient(authedContext());
      const result = await client.bindingPreflight({ hostname: "fresh.example.com" });

      expect(result.hostname.available).toBe(true);
      expect(result.hostname.format).toBe("valid");
    });

    it("flags invalid hostname format", async () => {
      const client = await getPluginClient(authedContext());
      const result = await client.bindingPreflight({ hostname: "INVALID HOSTNAME!" });

      expect(result.hostname.format).toBe("invalid");
      expect(result.hostname.available).toBe(false);
    });
  });

  describe("validators", () => {
    it("creates a validator and resolves it for staking from descendants", async () => {
      const client = await getPluginClient(orgContext());

      const tenant = await client.createTenant({
        name: "Validator Holder",
        accountId: "validatorholder.example.near",
        status: "active",
      });

      const country = await client.createNode({
        kind: "country",
        slug: "validatorland",
        name: "Validatorland",
        parentId: null,
        tenantId: tenant.id,
      });
      const state = await client.createNode({
        kind: "state",
        slug: "val-state",
        name: "Validator State",
        parentId: country.id,
        tenantId: tenant.id,
      });

      const validator = await client.createValidator({
        nodeId: country.id,
        accountId: "val1.near",
        role: "official",
        isDefault: true,
      });
      expect(validator).toMatchObject({
        nodeId: country.id,
        accountId: "val1.near",
        role: "official",
        isDefault: true,
      });

      const resolved = await client.resolveStakingValidators({ nodeId: state.id });
      expect(resolved.sourceNodeId).toBe(country.id);
      expect(resolved.validators.map((v) => v.accountId)).toEqual(["val1.near"]);

      const fetched = await client.getValidator({ validatorId: validator.id });
      expect(fetched?.id).toBe(validator.id);
    });
  });

  describe("testError", () => {
    it("maps error kinds to client-visible failures", async () => {
      const client = await getPluginClient();

      await expect(client.testError({ kind: "unauthorized" })).rejects.toThrow(
        "test unauthorized error",
      );
      await expect(client.testError({ kind: "forbidden" })).rejects.toThrow("test forbidden error");
      await expect(client.testError({ kind: "not_found" })).rejects.toThrow("test not found error");
      await expect(client.testError({ kind: "conflict" })).rejects.toThrow("test conflict error");
      await expect(client.testError({ kind: "bad_request" })).rejects.toThrow(
        "test bad request error",
      );
      await expect(client.testError({ kind: "internal" as never })).rejects.toThrow(
        "Internal server error",
      );
    });
  });
});
