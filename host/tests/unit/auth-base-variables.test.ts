import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { RuntimeConfig } from "../../src/services/config";
import { buildAuthBaseVariables } from "../../src/services/plugins";

function config(input: Partial<RuntimeConfig>): RuntimeConfig {
  return {
    env: "development",
    account: "test.near",
    domain: "test.app",
    networkId: "mainnet",
    ...input,
  } as RuntimeConfig;
}

function build(input: Partial<RuntimeConfig>, corsOrigins: string[] = []) {
  return Effect.runPromise(buildAuthBaseVariables(config(input), corsOrigins));
}

describe("buildAuthBaseVariables", () => {
  it("derives baseUrl from the bos config host url in development", async () => {
    const variables = await build({
      env: "development",
      host: { name: "host", url: "http://localhost:4100", entry: "", source: "local" },
    });

    expect(variables.baseUrl).toBe("http://localhost:4100");
    expect(variables.domain).toBe("http://localhost:4100");
  });

  it("passes an empty dev host url through — the plugin's parseTrustedOrigins owns the localhost:3000 fallback", async () => {
    const variables = await build({
      env: "development",
      host: { name: "host", url: "", entry: "", source: "local" },
    });

    expect(variables.baseUrl).toBe("");
  });

  it("uses the bos config domain as baseUrl in production (protocol-normalized)", async () => {
    const variables = await build({ env: "production", domain: "citynode.app" });

    expect(variables.baseUrl).toBe("https://citynode.app");
  });

  it("keeps trustedOrigins from corsOrigins", async () => {
    const variables = await build(
      {
        env: "development",
        host: { name: "host", url: "http://localhost:4100", entry: "", source: "local" },
      },
      ["http://localhost:4100", "http://localhost:3000"],
    );

    expect(variables.trustedOrigins).toEqual(["http://localhost:4100", "http://localhost:3000"]);
  });
});
