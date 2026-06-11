import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureEnvFile,
  loadProjectEnv,
  syncGeneratedInfra,
  writeGeneratedInfra,
} from "../../src/cli/infra";
import type { RuntimeConfig } from "../../src/types";

function buildRuntimeConfig(): RuntimeConfig {
  return {
    env: "development",
    account: "dev.everything.near",
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
      secrets: ["AUTH_DATABASE_URL", "BETTER_AUTH_SECRET", "CORS_ORIGIN"],
    },
    plugins: {
      projects: {
        name: "projects",
        url: "http://localhost:3010",
        entry: "/mf-manifest.json",
        source: "local",
        secrets: ["PROJECTS_DATABASE_URL", "PAYMENT_API_URL"],
      },
    },
  } as RuntimeConfig;
}

describe("generated infra", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes env example and docker compose from runtime secrets", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-infra-"));
    tempDirs.push(dir);

    const secrets = writeGeneratedInfra(dir, buildRuntimeConfig());
    const envExample = readFileSync(join(dir, ".env.example"), "utf-8");
    const dockerCompose = readFileSync(join(dir, "docker-compose.yml"), "utf-8");

    expect(secrets).toContain("API_DATABASE_URL");
    expect(secrets).toContain("AUTH_DATABASE_URL");
    expect(secrets).toContain("PROJECTS_DATABASE_URL");
    expect(secrets).toContain("PAYMENT_API_URL");

    expect(envExample).toContain("# app.host");
    expect(envExample).toContain("CORS_ORIGIN=http://localhost:3000");
    expect(envExample).toContain("# app.api");
    expect(envExample).toContain(
      "API_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );
    expect(envExample).toContain("# app.auth");
    expect(envExample).toContain(
      "AUTH_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5433/auth_db",
    );
    expect(envExample).toContain("BETTER_AUTH_SECRET=");
    expect(envExample).toContain("# plugins.projects");
    expect(envExample).toContain(
      "PROJECTS_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5434/projects_db",
    );
    expect(envExample).toContain("PAYMENT_API_URL=");

    expect(dockerCompose).toContain("name: dev.everything.near");
    expect(dockerCompose).toContain("postgres-api:");
    expect(dockerCompose).toContain("container_name: dev.everything.near-postgres-api");
    expect(dockerCompose).toContain("POSTGRES_DB: api_db");
    expect(dockerCompose).toContain('"5432:5432"');
    expect(dockerCompose).toContain("postgres-auth:");
    expect(dockerCompose).toContain("container_name: dev.everything.near-postgres-auth");
    expect(dockerCompose).toContain("POSTGRES_DB: auth_db");
    expect(dockerCompose).toContain('"5433:5432"');
    expect(dockerCompose).toContain("postgres-projects:");
    expect(dockerCompose).toContain("container_name: dev.everything.near-postgres-projects");
    expect(dockerCompose).toContain("POSTGRES_DB: projects_db");
    expect(dockerCompose).toContain('"5434:5432"');
    expect(dockerCompose).toContain("name: dev_everything_near_postgres_api_data");
    expect(dockerCompose).toContain("name: dev_everything_near_postgres_auth_data");
    expect(dockerCompose).toContain("name: dev_everything_near_postgres_projects_data");
    expect(dockerCompose).not.toContain("payment");
  });

  it("creates .env with generated auth secret and preserves other defaults", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-env-"));
    tempDirs.push(dir);

    writeGeneratedInfra(dir, buildRuntimeConfig());
    ensureEnvFile(dir);

    const env = readFileSync(join(dir, ".env"), "utf-8");

    expect(env).toContain(
      "API_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );
    expect(env).toContain(
      "AUTH_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5433/auth_db",
    );
    expect(env).toContain(
      "PROJECTS_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5434/projects_db",
    );
    expect(env).toContain("PAYMENT_API_URL=");
    expect(env).toContain("CORS_ORIGIN=http://localhost:3000");
    expect(env).toMatch(/BETTER_AUTH_SECRET=.+/);
  });

  it("skips rewriting generated infra when nothing changed", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-sync-env-"));
    tempDirs.push(dir);

    const first = syncGeneratedInfra(dir, buildRuntimeConfig());
    const second = syncGeneratedInfra(dir, buildRuntimeConfig());

    expect(first.envExampleChanged).toBe(true);
    expect(first.dockerComposeChanged).toBe(true);
    expect(second.envExampleChanged).toBe(false);
    expect(second.dockerComposeChanged).toBe(false);
  });

  it("loads .env into the bos process without overriding exported values", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-load-env-"));
    tempDirs.push(dir);

    const originalApi = process.env.API_DATABASE_URL;
    const originalAuth = process.env.AUTH_DATABASE_URL;
    const originalSecret = process.env.BETTER_AUTH_SECRET;

    try {
      process.env.API_DATABASE_URL = "postgres://already-exported";
      delete process.env.AUTH_DATABASE_URL;
      delete process.env.BETTER_AUTH_SECRET;

      writeFileSync(
        join(dir, ".env"),
        [
          "API_DATABASE_URL=postgres://from-dotenv",
          "AUTH_DATABASE_URL=postgres://auth-from-dotenv",
          "BETTER_AUTH_SECRET=test-secret",
        ].join("\n"),
      );

      loadProjectEnv(dir);

      expect(process.env.API_DATABASE_URL).toBe("postgres://already-exported");
      expect(process.env.AUTH_DATABASE_URL).toBe("postgres://auth-from-dotenv");
      expect(process.env.BETTER_AUTH_SECRET).toBe("test-secret");
    } finally {
      if (originalApi === undefined) delete process.env.API_DATABASE_URL;
      else process.env.API_DATABASE_URL = originalApi;

      if (originalAuth === undefined) delete process.env.AUTH_DATABASE_URL;
      else process.env.AUTH_DATABASE_URL = originalAuth;

      if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
      else process.env.BETTER_AUTH_SECRET = originalSecret;
    }
  });
});
