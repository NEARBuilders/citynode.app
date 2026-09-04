import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { ensureEnvFile, loadPortState, loadProjectEnv, savePortState } from "../../src/cli/infra";
import {
  buildGeneratedInfraSpec,
  InfraMaterializer,
  InfraMaterializerLive,
} from "../../src/infra/materializer";
import type { RuntimeConfig } from "../../src/types";

async function materialize(configDir: string, runtimeConfig: RuntimeConfig): Promise<void> {
  await Effect.runPromise(
    Effect.gen(function* () {
      const m = yield* InfraMaterializer;
      yield* m.materializeTemplate(configDir, runtimeConfig);
      yield* m.materializeTestInfra(configDir, runtimeConfig);
      yield* m.materializeCompose(configDir, runtimeConfig);
    }).pipe(Effect.provide(InfraMaterializerLive)),
  );
}

async function materializeWithPortState(
  configDir: string,
  runtimeConfig: RuntimeConfig,
): Promise<void> {
  await Effect.runPromise(
    Effect.gen(function* () {
      const m = yield* InfraMaterializer;
      yield* m.materializeTemplate(configDir, runtimeConfig);
      yield* m.materializeTestInfra(configDir, runtimeConfig);
      yield* m.materializeCompose(configDir, runtimeConfig);
      const { portState } = buildGeneratedInfraSpec(runtimeConfig, configDir);
      yield* m.persistPortState(configDir, portState);
    }).pipe(Effect.provide(InfraMaterializerLive)),
  );
}

function buildRuntimeConfig(overrides?: Partial<RuntimeConfig>): RuntimeConfig {
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
      example: {
        name: "example",
        url: "http://localhost:3010",
        entry: "/mf-manifest.json",
        source: "local" as const,
        secrets: ["EXAMPLE_DATABASE_URL", "PAYMENT_API_URL"],
      },
    },
    ...overrides,
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

  it("writes env example and docker compose from runtime secrets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-infra-"));
    tempDirs.push(dir);

    await materialize(dir, buildRuntimeConfig());
    const envExample = readFileSync(join(dir, ".env.example"), "utf-8");
    const dockerCompose = readFileSync(join(dir, "docker-compose.yml"), "utf-8");

    expect(envExample).toContain("API_DATABASE_URL");
    expect(envExample).toContain("AUTH_DATABASE_URL");
    expect(envExample).toContain("EXAMPLE_DATABASE_URL");
    expect(envExample).toContain("PAYMENT_API_URL");

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
    expect(envExample).toContain("# plugins.example");
    expect(envExample).toContain(
      "EXAMPLE_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
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
    expect(dockerCompose).not.toContain("postgres-example:");
    expect(dockerCompose).not.toContain("container_name: dev.everything.near-postgres-example");
    expect(dockerCompose).not.toContain("POSTGRES_DB: example_db");
    expect(dockerCompose).toContain("postgres-api-test:");
    expect(dockerCompose).toContain("container_name: dev.everything.near-postgres-api-test");
    expect(dockerCompose).toContain("POSTGRES_DB: api_test_db");
    expect(dockerCompose).toContain('"5434:5432"');
    expect(dockerCompose).toContain("postgres-auth-test:");
    expect(dockerCompose).toContain("container_name: dev.everything.near-postgres-auth-test");
    expect(dockerCompose).toContain("POSTGRES_DB: auth_test_db");
    expect(dockerCompose).toContain('"5435:5432"');
    expect(dockerCompose).not.toContain("postgres-example-test:");
    expect(dockerCompose).toContain("name: dev_everything_near_postgres_api_data");
    expect(dockerCompose).toContain("name: dev_everything_near_postgres_auth_data");
    expect(dockerCompose).toContain("name: dev_everything_near_postgres_api_test_data");
    expect(dockerCompose).toContain("name: dev_everything_near_postgres_auth_test_data");
    expect(dockerCompose).not.toContain("name: dev_everything_near_postgres_example_data");
    expect(dockerCompose).not.toContain("payment");
  });

  it("emits a per-service pg_isready -d <db> healthcheck on every postgres service", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-healthcheck-"));
    tempDirs.push(dir);

    await materialize(dir, buildRuntimeConfig());
    const dockerCompose = readFileSync(join(dir, "docker-compose.yml"), "utf-8");

    expect(dockerCompose).not.toContain('"pg_isready -U ${POSTGRES_USER}"');
    expect(dockerCompose).not.toContain('"pg_isready -U everythingdev"]');

    const expectedPairs: Array<[string, string]> = [
      ["postgres-api", "api_db"],
      ["postgres-auth", "auth_db"],
      ["postgres-api-test", "api_test_db"],
      ["postgres-auth-test", "auth_test_db"],
    ];
    for (const [service, db] of expectedPairs) {
      expect(dockerCompose).toContain(`  ${service}:`);
      expect(dockerCompose).toContain(`["CMD-SHELL", "pg_isready -U everythingdev -d ${db}"]`);
    }
  });

  it("writes a committed .env.test with isolated test database URLs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-env-test-"));
    tempDirs.push(dir);

    await materialize(dir, buildRuntimeConfig());
    const envTest = readFileSync(join(dir, ".env.test"), "utf-8");

    expect(envTest).toContain("# app.api");
    expect(envTest).toContain(
      "API_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5434/api_test_db",
    );
    expect(envTest).toContain("# app.auth");
    expect(envTest).toContain(
      "AUTH_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5435/auth_test_db",
    );
    expect(envTest).toContain("BETTER_AUTH_SECRET=regression-test-secret-do-not-use-in-production");
    expect(envTest).toContain("# plugins.example");
    expect(envTest).toContain(
      "EXAMPLE_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5434/api_test_db",
    );
    expect(envTest).not.toContain("CORS_ORIGIN=");
    expect(envTest).not.toContain("PAYMENT_API_URL=");
  });

  it("generates Redis docker compose and env for _REDIS_URL secrets", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-redis-"));
    tempDirs.push(dir);

    await materialize(
      dir,
      buildRuntimeConfig({
        plugins: {
          cache: {
            name: "cache",
            url: "http://localhost:3020",
            entry: "/mf-manifest.json",
            source: "local" as const,
            secrets: ["CACHE_REDIS_URL"],
          },
        },
      }),
    );
    const envExample = readFileSync(join(dir, ".env.example"), "utf-8");
    const dockerCompose = readFileSync(join(dir, "docker-compose.yml"), "utf-8");

    expect(envExample).toContain("CACHE_REDIS_URL");

    expect(envExample).toContain("# plugins.cache");
    expect(envExample).toContain("CACHE_REDIS_URL=redis://localhost:6379");

    expect(dockerCompose).toContain("x-redis-common: &redis-common");
    expect(dockerCompose).toContain("image: redis:7-alpine");
    expect(dockerCompose).toContain("command: redis-server --appendonly yes");
    expect(dockerCompose).toContain('test: ["CMD", "redis-cli", "ping"]');
    expect(dockerCompose).toContain("redis-cache:");
    expect(dockerCompose).toContain("container_name: dev.everything.near-redis-cache");
    expect(dockerCompose).toContain('"6379:6379"');
    expect(dockerCompose).toContain("dev_everything_near_redis_cache_data:/data");
    expect(dockerCompose).toContain("name: dev_everything_near_redis_cache_data");
  });

  it("generates Redis alongside Postgres in the same compose", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-mixed-"));
    tempDirs.push(dir);

    await materialize(
      dir,
      buildRuntimeConfig({
        plugins: {
          cache: {
            name: "cache",
            url: "http://localhost:3020",
            entry: "/mf-manifest.json",
            source: "local" as const,
            secrets: ["CACHE_REDIS_URL"],
          },
        },
      }),
    );
    const dockerCompose = readFileSync(join(dir, "docker-compose.yml"), "utf-8");

    expect(dockerCompose).toContain("x-pg-common:");
    expect(dockerCompose).toContain("x-redis-common:");
    expect(dockerCompose).toContain("postgres-api:");
    expect(dockerCompose).toContain("redis-cache:");
  });

  it("persists shared database ports in infra-state.json", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-state-"));
    tempDirs.push(dir);

    await materializeWithPortState(
      dir,
      buildRuntimeConfig({
        plugins: {
          example: {
            name: "example",
            url: "http://localhost:3010",
            entry: "/mf-manifest.json",
            source: "local" as const,
            secrets: ["EXAMPLE_DATABASE_URL"],
          },
        },
      }),
    );

    const statePath = join(dir, ".bos", "infra-state.json");
    expect(existsSync(statePath)).toBe(true);

    const firstState = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(firstState.postgresPorts.example).toBe(5432);

    const firstEnv = readFileSync(join(dir, ".env.example"), "utf-8");
    expect(firstEnv).toContain(
      "EXAMPLE_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );

    await materializeWithPortState(
      dir,
      buildRuntimeConfig({
        plugins: {
          example: {
            name: "example",
            url: "http://localhost:3010",
            entry: "/mf-manifest.json",
            source: "local" as const,
            secrets: ["EXAMPLE_DATABASE_URL"],
          },
          registry: {
            name: "registry",
            url: "http://localhost:3021",
            entry: "/mf-manifest.json",
            source: "local" as const,
            secrets: ["REGISTRY_DATABASE_URL"],
          },
        },
      }),
    );

    const secondState = JSON.parse(readFileSync(statePath, "utf-8"));
    expect(secondState.postgresPorts.example).toBe(5432);
    expect(secondState.postgresPorts.registry).toBe(5432);

    const secondEnv = readFileSync(join(dir, ".env.example"), "utf-8");
    expect(secondEnv).toContain(
      "EXAMPLE_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );
    expect(secondEnv).toContain(
      "REGISTRY_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );

    const dockerCompose = readFileSync(join(dir, "docker-compose.yml"), "utf-8");
    expect(dockerCompose).toContain('"5434:5432"');
    expect(dockerCompose).toContain('"5435:5432"');
    expect(dockerCompose).not.toContain('"5436:5432"');
    expect(dockerCompose).not.toContain("postgres-example-test:");
    expect(dockerCompose).not.toContain("postgres-registry-test:");
  });

  it("assigns all non-auth database secrets to the shared API port", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-order-"));
    tempDirs.push(dir);

    mkdirSync(join(dir, ".bos"), { recursive: true });

    await materializeWithPortState(
      dir,
      buildRuntimeConfig({
        plugins: {
          zebra: {
            name: "zebra",
            url: "http://localhost:3030",
            entry: "/mf-manifest.json",
            source: "local" as const,
            secrets: ["ZEBRA_DATABASE_URL"],
          },
          alpha: {
            name: "alpha",
            url: "http://localhost:3040",
            entry: "/mf-manifest.json",
            source: "local" as const,
            secrets: ["ALPHA_DATABASE_URL"],
          },
          beta: {
            name: "beta",
            url: "http://localhost:3050",
            entry: "/mf-manifest.json",
            source: "local" as const,
            secrets: ["BETA_DATABASE_URL"],
          },
        },
      }),
    );

    const state = JSON.parse(readFileSync(join(dir, ".bos", "infra-state.json"), "utf-8"));

    expect(state.postgresPorts.alpha).toBe(5432);
    expect(state.postgresPorts.beta).toBe(5432);
    expect(state.postgresPorts.zebra).toBe(5432);
  });

  it("creates .env with generated auth secret and preserves other defaults", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-env-"));
    tempDirs.push(dir);

    await materialize(dir, buildRuntimeConfig());
    ensureEnvFile(dir);

    const env = readFileSync(join(dir, ".env"), "utf-8");

    expect(env).toContain(
      "API_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );
    expect(env).toContain(
      "AUTH_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5433/auth_db",
    );
    expect(env).toContain(
      "EXAMPLE_DATABASE_URL=postgres://everythingdev:everythingdev@localhost:5432/api_db",
    );
    expect(env).toContain("PAYMENT_API_URL=");
    expect(env).toContain("CORS_ORIGIN=http://localhost:3000");
    expect(env).toMatch(/BETTER_AUTH_SECRET=.+/);
  });

  it("skips rewriting generated infra when nothing changed", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-sync-env-"));
    tempDirs.push(dir);

    await materialize(dir, buildRuntimeConfig());

    const firstExample = readFileSync(join(dir, ".env.example"), "utf-8");
    const firstTest = readFileSync(join(dir, ".env.test"), "utf-8");
    const firstCompose = readFileSync(join(dir, "docker-compose.yml"), "utf-8");
    const firstMtimes = [
      statSync(join(dir, ".env.example")).mtimeMs,
      statSync(join(dir, ".env.test")).mtimeMs,
      statSync(join(dir, "docker-compose.yml")).mtimeMs,
    ];

    // sleep well above filesystem mtime resolution so a re-write is detectable
    await new Promise((r) => setTimeout(r, 1100));

    await materialize(dir, buildRuntimeConfig());

    expect(readFileSync(join(dir, ".env.example"), "utf-8")).toBe(firstExample);
    expect(readFileSync(join(dir, ".env.test"), "utf-8")).toBe(firstTest);
    expect(readFileSync(join(dir, "docker-compose.yml"), "utf-8")).toBe(firstCompose);
    expect(statSync(join(dir, ".env.example")).mtimeMs).toBe(firstMtimes[0]!);
    expect(statSync(join(dir, ".env.test")).mtimeMs).toBe(firstMtimes[1]!);
    expect(statSync(join(dir, "docker-compose.yml")).mtimeMs).toBe(firstMtimes[2]!);
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

  it("keeps CORS_ORIGIN stable at :3000 in .env.example regardless of host.port", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-cors-stable-"));
    tempDirs.push(dir);

    await materialize(
      dir,
      buildRuntimeConfig({
        host: {
          name: "host",
          url: "http://localhost:3210",
          entry: "/mf-manifest.json",
          port: 3210,
        },
      }),
    );
    const envExample = readFileSync(join(dir, ".env.example"), "utf-8");
    expect(envExample).toContain("CORS_ORIGIN=http://localhost:3000");
    expect(envExample).not.toContain("CORS_ORIGIN=http://localhost:3210");
  });

  it("keeps CORS_ORIGIN stable when host.url resolves to a non-default port", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-cors-stable-url-"));
    tempDirs.push(dir);

    await materialize(
      dir,
      buildRuntimeConfig({
        host: { name: "host", url: "http://localhost:3055", entry: "/mf-manifest.json" },
      }),
    );
    const envExample = readFileSync(join(dir, ".env.example"), "utf-8");
    expect(envExample).toContain("CORS_ORIGIN=http://localhost:3000");
    expect(envExample).not.toContain("CORS_ORIGIN=http://localhost:3055");
  });

  // canary: production-env path is identical to the dev path now that
  // CORS_ORIGIN is decoupled from the runtime host port. Kept as a guard
  // in case an env-mode conditional is reintroduced.
  it("skips dev CORS_ORIGIN override in production env", async () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-cors-prod-"));
    tempDirs.push(dir);

    await materialize(
      dir,
      buildRuntimeConfig({
        env: "production",
        host: {
          name: "host",
          url: "http://localhost:3210",
          entry: "/mf-manifest.json",
          port: 3210,
        },
      }),
    );
    const envExample = readFileSync(join(dir, ".env.example"), "utf-8");
    expect(envExample).toContain("CORS_ORIGIN=http://localhost:3000");
  });

  it("persists and reloads devPorts via loadPortState/savePortState", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-devports-"));
    tempDirs.push(dir);

    savePortState(dir, {
      postgresPorts: {},
      redisPorts: {},
      devPorts: { host: 3100, api: 3101, ui: 3103, pluginPortStart: 3110 },
    });
    const loaded = loadPortState(dir);
    expect(loaded.devPorts?.host).toBe(3100);
    expect(loaded.devPorts?.api).toBe(3101);
    expect(loaded.devPorts?.pluginPortStart).toBe(3110);
  });

  it("devPorts round-trips undefined slots for remote services (Bug A)", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-devports-remote-"));
    tempDirs.push(dir);

    savePortState(dir, {
      postgresPorts: {},
      redisPorts: {},
      devPorts: {
        host: 3100,
        api: undefined,
        ui: 3103,
        auth: undefined,
        pluginPortStart: undefined,
      },
    });
    const loaded = loadPortState(dir);
    expect(loaded.devPorts?.host).toBe(3100);
    expect(loaded.devPorts?.api).toBeUndefined();
    expect(loaded.devPorts?.ui).toBe(3103);
    expect(loaded.devPorts?.auth).toBeUndefined();
    expect(loaded.devPorts?.pluginPortStart).toBeUndefined();
  });

  it("loadPortState tolerates missing devPorts on existing state files", () => {
    const dir = mkdtempSync(join(tmpdir(), "bos-devports-legacy-"));
    tempDirs.push(dir);

    mkdirSync(join(dir, ".bos"), { recursive: true });
    writeFileSync(
      join(dir, ".bos", "infra-state.json"),
      JSON.stringify({ postgresPorts: { api: 5432 }, redisPorts: {} }),
    );
    const loaded = loadPortState(dir);
    expect(loaded.devPorts).toBeUndefined();
    expect(loaded.postgresPorts.api).toBe(5432);
  });
});
