import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  defaultSlug,
  leaseKey,
  readLeases,
  sandboxLeasesPath,
  sanitizeDockerName,
  writeLeases,
} from "../../src/sandbox/lease-store";
import {
  buildTenantBootConfig,
  dockerHostName,
  dockerPgName,
} from "../../src/sandbox/tenant-config";

describe("sandbox tenant config", () => {
  let configDir: string;

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), "bos-sandbox-tc-"));
    writeFileSync(
      join(configDir, "bos.config.json"),
      JSON.stringify({
        account: "v1.citynode.near",
        domain: "citynode.app",
        title: "CityNode",
        app: {
          host: { development: "local:host", production: "https://host.example.app" },
          ui: { development: "local:ui", production: "https://ui.example.app" },
          api: {
            development: "local:api",
            production: "https://api.example.app",
            secrets: ["API_DATABASE_URL"],
          },
          auth: {
            development: "local:plugins/auth",
            production: "https://auth.example.app",
            ui: { development: "local:plugins/auth/ui", production: "https://auth-ui.example.app" },
            secrets: ["AUTH_DATABASE_URL", "BETTER_AUTH_SECRET"],
          },
        },
        plugins: {
          template: { development: "local:plugins/_template" },
          apps: { development: "local:plugins/apps" },
          votes: { development: "local:plugins/votes" },
        },
      }),
    );
  });

  afterEach(() => {
    rmSync(configDir, { recursive: true, force: true });
  });

  it("swaps the tenant account in and keeps the base namespace bundle base", () => {
    const config = buildTenantBootConfig({ account: "t.near", gateway: "citynode.app" }, configDir);
    expect(config.account).toBe("t.near");
    expect(config.domain).toBe("citynode.app");
    const ui = (config.app as any).ui;
    expect(ui.publicUrl).toBe("/bundles/v1.citynode.near/citynode.app/ui");
    expect(ui.production).toBe("http://localhost:4103");
  });

  it("assigns plugin ports in sorted order (matching the image's staged layout)", () => {
    const config = buildTenantBootConfig({ account: "t.near", gateway: "citynode.app" }, configDir);
    const plugins = (config.plugins ?? {}) as Record<string, any>;
    expect(plugins.apps.production).toBe("http://localhost:4110");
    expect(plugins.template.production).toBe("http://localhost:4111");
    expect(plugins.votes.production).toBe("http://localhost:4112");
  });

  it("throws when no bos.config.json exists", () => {
    expect(() =>
      buildTenantBootConfig({ account: "t.near", gateway: "g" }, join(configDir, "missing")),
    ).toThrow(/bos.config.json not found/);
  });

  it("names containers deterministically from the slug", () => {
    expect(dockerPgName("t")).toBe("bos-sandbox-pg-t");
    expect(dockerHostName("t")).toBe("bos-sandbox-host-t");
    expect(dockerHostName("t.near")).toBe("bos-sandbox-host-t-near");
  });
});

describe("sandbox lease store", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bos-sandbox-lease-"));
    delete process.env.BOS_SANDBOX_LEASES;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    delete process.env.BOS_SANDBOX_LEASES;
  });

  const lease = (account: string) => ({
    account,
    gateway: "citynode.app",
    slug: defaultSlug(account),
    url: `http://localhost:41000`,
    hostPort: 41000,
    pgPort: 41001,
    stage: `sandbox-${defaultSlug(account)}`,
    image: "citynode-platform:spike",
    createdAt: new Date().toISOString(),
  });

  it("round-trips leases through the file", () => {
    const path = join(dir, "sandboxes.json");
    writeLeases(path, [lease("a.near"), lease("b.near")]);
    expect(readLeases(path).map((l) => l.account)).toEqual(["a.near", "b.near"]);
  });

  it("returns [] for missing or corrupt files", () => {
    expect(readLeases(join(dir, "missing.json"))).toEqual([]);
    const corrupt = join(dir, "corrupt.json");
    writeFileSync(corrupt, "{ not json");
    expect(readLeases(corrupt)).toEqual([]);
  });

  it("sandboxLeasesPath honors BOS_SANDBOX_LEASES and configDir", () => {
    expect(sandboxLeasesPath("/tmp/project").endsWith(join(".bos", "sandboxes.json"))).toBe(true);
    process.env.BOS_SANDBOX_LEASES = "/tmp/override.json";
    expect(sandboxLeasesPath()).toBe("/tmp/override.json");
    delete process.env.BOS_SANDBOX_LEASES;
  });

  it("leaseKey and slug helpers", () => {
    expect(leaseKey({ account: "a.near", gateway: "g.app" })).toBe("a.near/g.app");
    expect(defaultSlug("Sandbox.Demo.near")).toBe("sandbox");
    expect(sanitizeDockerName("T.East near")).toBe("t-east-near");
  });
});
