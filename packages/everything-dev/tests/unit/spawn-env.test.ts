import { describe, expect, it } from "vitest";
import { composeSpawnEnv } from "../../src/orchestrator";

describe("composeSpawnEnv", () => {
  it("generated env wins over stale process env (port drift)", () => {
    const env = composeSpawnEnv(
      { CORS_ORIGIN: "http://localhost:3000", PATH: "/usr/bin" },
      { CORS_ORIGIN: "http://localhost:3008" },
      3008,
    );

    expect(env.CORS_ORIGIN).toBe("http://localhost:3008");
    expect(env.PATH).toBe("/usr/bin");
    expect(env.PORT).toBe("3008");
    expect(env.FORCE_COLOR).toBe("1");
  });

  it("the resolved service port is authoritative over a generated PORT value", () => {
    const env = composeSpawnEnv({}, { PORT: "9999", CORS_ORIGIN: "http://localhost:3000" }, 3008);

    expect(env.PORT).toBe("3008");
  });

  it("omits PORT when the service has no resolved port", () => {
    const env = composeSpawnEnv({}, { CORS_ORIGIN: "http://localhost:3000" }, 0);

    expect(env.PORT).toBeUndefined();
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
  });
});
