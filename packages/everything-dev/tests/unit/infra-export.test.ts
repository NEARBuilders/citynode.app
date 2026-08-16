import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildCiInfraPlan,
  buildOriginMap,
  ensureEnvFile,
  syncGeneratedInfra,
  writeGeneratedInfra,
} from "../../src/cli/infra";
import type { RuntimeConfig, RuntimePluginConfig } from "../../src/types";

function buildRuntimeConfig(overrides?: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    env: "development",
    account: "dev.everything.near",
    networkId: "mainnet",
    domain: "dev.everything.dev",
    host: {
      name: "host",
      url: "http://localhost:4100",
      entry: "/mf-manifest.json",
      port: 4100,
    },
    ui: { name: "ui", url: "http://localhost:3003", entry: "/mf-manifest.json" },
    api: {
      name: "api",
      url: "http://localhost:3001",
      entry: "/mf-manifest.json",
      secrets: ["API_DATABASE_URL"],
    },
    auth: {
      name: "auth",
      url: "http://localhost:3002",
      entry: "/mf-manifest.json",
      secrets: ["AUTH_DATABASE_URL", "BETTER_AUTH_SECRET", "CORS_ORIGIN"],
    },
    plugins: {
      example: {
        name: "example",
        url: "http://localhost:3010",
        entry: "/mf-manifest.json",
        source: "local" as const,
        secrets: ["EXAMPLE_DATABASE_URL"],
      } as RuntimePluginConfig,
    },
    ...overrides,
  } as RuntimeConfig;
}

describe("buildCiInfraPlan", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits env vars and services for api+auth+plugin secrets", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-ci-infra-"));
    tempDirs.push(dir);
    writeGeneratedInfra(dir, buildRuntimeConfig());
    ensureEnvFile(dir);

    const runtime = {
      ...buildRuntimeConfig(),
      env: "production" as const,
    };
    const plan = buildCiInfraPlan(runtime, { configDir: dir });

    expect(plan.env["API_DATABASE_URL"]).toBe(
      "postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );
    expect(plan.env["AUTH_DATABASE_URL"]).toBe(
      "postgres://everythingdev:everythingdev@localhost:5433/auth_db",
    );
    expect(plan.env["EXAMPLE_DATABASE_URL"]).toBe(
      "postgres://everythingdev:everythingdev@localhost:5434/example_db",
    );
    expect(plan.env["BETTER_AUTH_SECRET"]).toBe("");
    expect(plan.env["CORS_ORIGIN"]).toBe("http://127.0.0.1:4100");

    expect(plan.services.length).toBeGreaterThanOrEqual(3);
    const serviceKeys = plan.services.map((s) => s.key);
    expect(serviceKeys).toContain("api");
    expect(serviceKeys).toContain("auth");
    expect(serviceKeys).toContain("example");

    const apiService = plan.services.find((s) => s.key === "api");
    expect(apiService?.image).toBe("postgres:17-alpine");
    expect(apiService?.ports).toEqual(["5432:5432"]);
    expect(apiService?.database).toEqual({
      user: "everythingdev",
      password: "everythingdev",
      name: "api_db",
    });
  });

  it("honors hostPortOverride and BOS_CI_HOST_PORT env fallback", () => {
    const previous = process.env.BOS_CI_HOST_PORT;
    try {
      process.env.BOS_CI_HOST_PORT = "5173";
      const plan = buildCiInfraPlan(buildRuntimeConfig(), {});
      expect(plan.env["CORS_ORIGIN"]).toBe("http://127.0.0.1:5173");

      const override = buildCiInfraPlan(buildRuntimeConfig(), { hostPortOverride: 8080 });
      expect(override.env["CORS_ORIGIN"]).toBe("http://127.0.0.1:8080");
    } finally {
      if (previous === undefined) delete process.env.BOS_CI_HOST_PORT;
      else process.env.BOS_CI_HOST_PORT = previous;
    }
  });

  it("tracks stable ports across calls (portMap persistence)", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-ci-infra-ports-"));
    tempDirs.push(dir);
    const cfg = buildRuntimeConfig();
    syncGeneratedInfra(dir, cfg);
    const first = buildCiInfraPlan(cfg, { configDir: dir });
    const second = buildCiInfraPlan(cfg, { configDir: dir });

    const firstApi = first.services.find((s) => s.key === "api");
    const secondApi = second.services.find((s) => s.key === "api");
    expect(firstApi?.ports).toEqual(secondApi?.ports);
  });
});

describe("buildOriginMap from resolved RuntimeConfig", () => {
  it("uses plugin extendsRef for plugin origins", () => {
    const runtime: RuntimeConfig = {
      env: "development",
      account: "city.example.near",
      networkId: "mainnet",
      host: { name: "host", url: "http://localhost:3000", entry: "/mf-manifest.json" },
      ui: { name: "ui", url: "http://localhost:3003", entry: "/mf-manifest.json" },
      api: {
        name: "api",
        url: "http://localhost:3001",
        entry: "/mf-manifest.json",
        secrets: ["API_DATABASE_URL"],
      },
      auth: {
        name: "auth",
        url: "http://localhost:3002",
        entry: "/mf-manifest.json",
        extendsRef: "bos://auth.everything.near/auth.everything.dev#app.auth",
        secrets: ["AUTH_DATABASE_URL"],
      },
      plugins: {
        apps: {
          name: "apps",
          url: "http://localhost:3010",
          entry: "/mf-manifest.json",
          source: "local" as const,
          extendsRef: "bos://something/near/gateway",
          secrets: ["APPS_DATABASE_URL"],
        } as RuntimePluginConfig,
      },
    } as RuntimeConfig;

    const map = buildOriginMap("", runtime);

    expect(map.get("API_DATABASE_URL")).toBe("city.example.near");
    expect(map.get("AUTH_DATABASE_URL")).toBe("auth.everything.near");
    expect(map.get("APPS_DATABASE_URL")).toBe("something");
  });

  it("falls back to runtime.account when extendsRef is absent", () => {
    const runtime: RuntimeConfig = {
      env: "development",
      account: "city.example.near",
      networkId: "mainnet",
      host: { name: "host", url: "http://localhost:3000", entry: "/mf-manifest.json" },
      ui: { name: "ui", url: "http://localhost:3003", entry: "/mf-manifest.json" },
      api: {
        name: "api",
        url: "http://localhost:3001",
        entry: "/mf-manifest.json",
        secrets: ["API_DATABASE_URL"],
      },
      plugins: {
        localonly: {
          name: "localonly",
          url: "http://localhost:3010",
          entry: "/mf-manifest.json",
          source: "local" as const,
          secrets: ["LOCALONLY_DATABASE_URL"],
        } as RuntimePluginConfig,
      },
    } as RuntimeConfig;

    const map = buildOriginMap("", runtime);
    expect(map.get("API_DATABASE_URL")).toBe("city.example.near");
    expect(map.get("LOCALONLY_DATABASE_URL")).toBe("city.example.near");
  });
});
