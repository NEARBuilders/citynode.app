import { describe, expect, it } from "vitest";
import { composeSpawnEnv, mergeGeneratedOverFileEnv } from "../../src/orchestrator";

describe("mergeGeneratedOverFileEnv", () => {
  it("generated env wins over stale .env-file values (port drift)", () => {
    const merged = mergeGeneratedOverFileEnv(
      { CORS_ORIGIN: "http://localhost:3008" },
      { CORS_ORIGIN: "http://localhost:3000", PATH: "/usr/bin" },
    );

    expect(merged.CORS_ORIGIN).toBe("http://localhost:3008");
    expect(merged.PATH).toBe("/usr/bin");
  });

  it("shell-exported values outrank the generated env (regression harness / CI)", () => {
    const merged = mergeGeneratedOverFileEnv(
      {
        API_DATABASE_URL: "postgres://u:p@127.0.0.1:5432/api_db",
        AUTH_DATABASE_URL: "postgres://u:p@127.0.0.1:5433/auth_db",
      },
      {
        API_DATABASE_URL: "postgres://u:p@127.0.0.1:5434/api_test_db",
        AUTH_DATABASE_URL: "postgres://u:p@127.0.0.1:5435/auth_test_db",
        BOS_NO_PERSIST_PORTS: "1",
      },
      {
        API_DATABASE_URL: "postgres://u:p@127.0.0.1:5434/api_test_db",
        AUTH_DATABASE_URL: "postgres://u:p@127.0.0.1:5435/auth_test_db",
      },
    );

    expect(merged.API_DATABASE_URL).toBe("postgres://u:p@127.0.0.1:5434/api_test_db");
    expect(merged.AUTH_DATABASE_URL).toBe("postgres://u:p@127.0.0.1:5435/auth_test_db");
    expect(merged.BOS_NO_PERSIST_PORTS).toBe("1");
  });

  it("without a shell tier the generated env wins over everything in process env", () => {
    const merged = mergeGeneratedOverFileEnv(
      { CORS_ORIGIN: "http://localhost:3008" },
      {
        CORS_ORIGIN: "http://localhost:3000",
      },
    );

    expect(merged.CORS_ORIGIN).toBe("http://localhost:3008");
  });
});

describe("composeSpawnEnv", () => {
  it("shell tier survives; .env-derived tier loses to generated; PORT is authoritative", () => {
    const env = composeSpawnEnv(
      {
        CORS_ORIGIN: "http://localhost:3000",
        API_DATABASE_URL: "postgres://u:p@127.0.0.1:5434/api_test_db",
        PATH: "/usr/bin",
      },
      {
        CORS_ORIGIN: "http://localhost:3008",
        API_DATABASE_URL: "postgres://u:p@127.0.0.1:5432/api_db",
        PORT: "9999",
      },
      3008,
      { API_DATABASE_URL: "postgres://u:p@127.0.0.1:5434/api_test_db" },
    );

    expect(env.API_DATABASE_URL).toBe("postgres://u:p@127.0.0.1:5434/api_test_db");
    expect(env.CORS_ORIGIN).toBe("http://localhost:3008");
    expect(env.PORT).toBe("3008");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.FORCE_COLOR).toBe("1");
  });

  it("omits PORT when the service has no resolved port", () => {
    const env = composeSpawnEnv({}, { CORS_ORIGIN: "http://localhost:3000" }, 0);

    expect(env.PORT).toBeUndefined();
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
  });
});
