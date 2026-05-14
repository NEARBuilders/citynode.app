import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureEnvFile, writeGeneratedInfra } from "../../src/cli/infra";
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

    expect(envExample).toContain(
      "API_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );
    expect(envExample).toContain(
      "AUTH_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5433/auth_db",
    );
    expect(envExample).toContain(
      "PROJECTS_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5434/projects_db",
    );
    expect(envExample).toContain("PAYMENT_API_URL=");
    expect(envExample).toContain("CORS_ORIGIN=http://localhost:3000");
    expect(envExample).toContain("BETTER_AUTH_SECRET=");

    expect(dockerCompose).toContain("postgres-api:");
    expect(dockerCompose).toContain("POSTGRES_DB: api_db");
    expect(dockerCompose).toContain('"5432:5432"');
    expect(dockerCompose).toContain("postgres-auth:");
    expect(dockerCompose).toContain("POSTGRES_DB: auth_db");
    expect(dockerCompose).toContain('"5433:5432"');
    expect(dockerCompose).toContain("postgres-projects:");
    expect(dockerCompose).toContain("POSTGRES_DB: projects_db");
    expect(dockerCompose).toContain('"5434:5432"');
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
});
