import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contract } from "@/contract";
import { authedContext, getPluginClient, teardown } from "../setup";

function spawnContext(userId: string, primaryAccountId?: string): Record<string, unknown> {
  const context = authedContext(userId);
  if (primaryAccountId) {
    context.near = { primaryAccountId };
  }
  return context;
}

describe("User-owned tenant spawn", () => {
  beforeAll(async () => {
    await getPluginClient(authedContext("spawn-boot-user"));
  }, 30_000);

  afterAll(async () => {
    await teardown();
  });

  it("does not expose spawnNode or createNode", () => {
    expect(contract).not.toHaveProperty("spawnNode");
    expect(contract).not.toHaveProperty("createNode");
  });

  describe("spawnTenant", () => {
    it("creates a user-owned tenant with a verified gateway-zone binding", async () => {
      const c = await getPluginClient(spawnContext("spawn-user-1", "spawn-wallet-1.near"));

      const result = await c.spawnTenant({
        name: "My Fresh App",
        hostname: "my-fresh-app.citynode.app",
      });

      expect(result.tenant).toMatchObject({
        name: "My Fresh App",
        accountId: "spawn-wallet-1.near",
        ownerKind: "user",
        ownerUserId: "spawn-user-1",
        orgId: null,
        status: "active",
      });
      expect(result.binding).toMatchObject({
        tenantId: result.tenant.id,
        hostname: "my-fresh-app.citynode.app",
        isPrimary: true,
        isVerified: true,
      });
      expect(result.binding.verifiedAt).toBeTruthy();
      expect(result.ownerAccountId).toBe("spawn-wallet-1.near");
      expect(result.publishStatus).toBe("ready");
    });

    it("marks passkey-derived owners as pending funding", async () => {
      const c = await getPluginClient(
        spawnContext("spawn-user-2", "0s0123456789abcdef0123456789abcdef01234567"),
      );

      const result = await c.spawnTenant({
        name: "Passkey App",
        hostname: "passkey-app.citynode.app",
      });

      expect(result.publishStatus).toBe("pending_funding");
      expect(result.binding.isVerified).toBe(true);
    });

    it("leaves non-gateway hostnames unverified with a token", async () => {
      const c = await getPluginClient(spawnContext("spawn-user-3", "spawn-wallet-3.near"));

      const result = await c.spawnTenant({
        name: "Custom Domain App",
        hostname: "myapp.example.com",
      });

      expect(result.binding.isVerified).toBe(false);
      expect(result.binding.verifiedAt).toBeNull();
      expect(result.binding.verificationToken).toBeTruthy();
    });

    it("rejects spawns without a linked NEAR account", async () => {
      const c = await getPluginClient(spawnContext("spawn-user-4"));

      await expect(
        c.spawnTenant({ name: "No Account App", hostname: "no-account.citynode.app" }),
      ).rejects.toThrow("Link a NEAR account");
    });

    it("rejects a second spawn by the same owner account", async () => {
      const c = await getPluginClient(spawnContext("spawn-user-5", "spawn-wallet-5.near"));

      await c.spawnTenant({ name: "First Spawn", hostname: "first-spawn.citynode.app" });

      await expect(
        c.spawnTenant({ name: "Second Spawn", hostname: "second-spawn.citynode.app" }),
      ).rejects.toThrow("Tenant with this accountId already exists");
    });

    it("rejects duplicate hostnames", async () => {
      const c = await getPluginClient(spawnContext("spawn-user-6", "spawn-wallet-6.near"));

      await c.spawnTenant({ name: "Dup Host", hostname: "dup-host.citynode.app" });

      const other = await getPluginClient(spawnContext("spawn-user-7", "spawn-wallet-7.near"));
      await expect(
        other.spawnTenant({ name: "Dup Host Clone", hostname: "dup-host.citynode.app" }),
      ).rejects.toThrow("Hostname already in use");
    });
  });

  describe("reserved hostnames", () => {
    it.each([
      "www",
      "admin",
      "api",
      "auth",
      "login",
      "docs",
      "staging",
    ])("rejects %s.citynode.app for ordinary members", async (label) => {
      const c = await getPluginClient(
        spawnContext(`reserved-user-${label}`, `reserved-${label}.near`),
      );

      await expect(
        c.spawnTenant({ name: label, hostname: `${label}.citynode.app` }),
      ).rejects.toThrow("reserved for the platform");
    });

    it("rejects nested, apex, padded and trailing-dot spellings", async () => {
      const c = await getPluginClient(spawnContext("reserved-spelling", "reserved-spelling.near"));

      for (const hostname of [
        "shop.admin.citynode.app",
        "citynode.app",
        " WWW.CITYNODE.APP. ",
        "testnet",
        "TESTNET",
      ]) {
        await expect(c.spawnTenant({ name: "Spelling", hostname })).rejects.toThrow(
          "reserved for the platform",
        );
      }
    });

    it("ignores a client-supplied override flag", async () => {
      const c = await getPluginClient(spawnContext("reserved-override", "reserved-override.near"));

      await expect(
        c.spawnTenant({
          name: "Override",
          hostname: "www.citynode.app",
          allowReservedHostname: true,
        } as Parameters<typeof c.spawnTenant>[0]),
      ).rejects.toThrow("reserved for the platform");
    });

    it("rejects reserved names when adding a binding", async () => {
      const c = await getPluginClient(spawnContext("reserved-binding", "reserved-binding.near"));
      const spawned = await c.spawnTenant({
        name: "Binding Owner",
        hostname: "binding-owner.citynode.app",
      });

      for (const hostname of ["api.citynode.app", "docs", "testnet"]) {
        await expect(c.createBinding({ tenantId: spawned.tenant.id, hostname })).rejects.toThrow(
          "reserved for the platform",
        );
      }
      const status = await c.getSpawnStatus({ tenantId: spawned.tenant.id });
      expect(status.bindings).toHaveLength(1);
    });

    it("reports reserved names as well-formed but unavailable in preflight", async () => {
      const c = await getPluginClient(
        spawnContext("reserved-preflight", "reserved-preflight.near"),
      );

      expect((await c.bindingPreflight({ hostname: "www.citynode.app" })).hostname).toEqual({
        available: false,
        format: "valid",
      });
      expect((await c.bindingPreflight({ hostname: "free-name.citynode.app" })).hostname).toEqual({
        available: true,
        format: "valid",
      });
    });

    it("lets platform admins claim reserved names", async () => {
      const context = spawnContext("reserved-platform-admin", "reserved-platform.near");
      context.user = { id: "reserved-platform-admin", role: "admin" };
      const admin = await getPluginClient(context);

      expect((await admin.bindingPreflight({ hostname: "www.citynode.app" })).hostname).toEqual({
        available: true,
        format: "valid",
      });
      const spawned = await admin.spawnTenant({ name: "Platform", hostname: "www.citynode.app" });
      expect(spawned.binding).toMatchObject({ hostname: "www.citynode.app", isVerified: true });

      const binding = await admin.createBinding({
        tenantId: spawned.tenant.id,
        hostname: "api.citynode.app",
      });
      expect(binding).toMatchObject({ hostname: "api.citynode.app", isVerified: true });
    });

    it("keeps reserved labels on custom domains claimable", async () => {
      const c = await getPluginClient(spawnContext("reserved-custom", "reserved-custom.near"));

      const result = await c.spawnTenant({ name: "Custom", hostname: "www.example.com" });

      expect(result.binding.isVerified).toBe(false);
    });
  });

  describe("hostname format", () => {
    it("accepts a hostname over 64 characters when every label is valid", async () => {
      const c = await getPluginClient(spawnContext("long-host", "long-host.near"));
      const hostname = `${"a".repeat(60)}.citynode.app`;

      const result = await c.spawnTenant({ name: "Long Host", hostname });

      expect(result.binding.hostname).toBe(hostname);
    });

    it("rejects a label over 63 characters", async () => {
      const c = await getPluginClient(spawnContext("long-label", "long-label.near"));

      await expect(
        c.spawnTenant({ name: "Long Label", hostname: `${"a".repeat(64)}.citynode.app` }),
      ).rejects.toThrow("Invalid hostname format");
    });

    it("stores the normalized hostname", async () => {
      const c = await getPluginClient(spawnContext("normalized-host", "normalized-host.near"));

      const result = await c.spawnTenant({
        name: "Normalized",
        hostname: " Normalized-Host.CityNode.App. ",
      });

      expect(result.binding.hostname).toBe("normalized-host.citynode.app");
    });
  });

  describe("getSpawnStatus", () => {
    it("returns the tenant, bindings, and publish status for the owner", async () => {
      const owner = await getPluginClient(spawnContext("spawn-user-8", "spawn-wallet-8.near"));
      const spawned = await owner.spawnTenant({
        name: "Status App",
        hostname: "status-app.citynode.app",
      });

      const status = await owner.getSpawnStatus({ tenantId: spawned.tenant.id });
      expect(status.tenant.id).toBe(spawned.tenant.id);
      expect(status.ownerAccountId).toBe("spawn-wallet-8.near");
      expect(status.publishStatus).toBe("ready");
      expect(status.bindings.map((b) => b.hostname)).toEqual(["status-app.citynode.app"]);
    });

    it("forbids non-owners", async () => {
      const owner = await getPluginClient(spawnContext("spawn-user-9", "spawn-wallet-9.near"));
      const spawned = await owner.spawnTenant({
        name: "Private App",
        hostname: "private-app.citynode.app",
      });

      const stranger = await getPluginClient(spawnContext("spawn-user-10", "stranger.near"));
      await expect(stranger.getSpawnStatus({ tenantId: spawned.tenant.id })).rejects.toThrow(
        "You do not own this tenant",
      );

      const admin = await getPluginClient(authedContext("spawn-admin", "admin"));
      const adminStatus = await admin.getSpawnStatus({ tenantId: spawned.tenant.id });
      expect(adminStatus.tenant.id).toBe(spawned.tenant.id);
    });
  });

  describe("listTenants scoping", () => {
    it("includes user-owned tenants for the owner without an organization", async () => {
      const owner = await getPluginClient(spawnContext("spawn-user-11", "spawn-wallet-11.near"));
      const spawned = await owner.spawnTenant({
        name: "Listed App",
        hostname: "listed-app.citynode.app",
      });

      const tenants = await owner.listTenants();
      expect(tenants.map((t) => t.id)).toContain(spawned.tenant.id);

      const stranger = await getPluginClient(spawnContext("spawn-user-12", "stranger-12.near"));
      const strangerTenants = await stranger.listTenants();
      expect(strangerTenants.map((t) => t.id)).not.toContain(spawned.tenant.id);
    });
  });
});
