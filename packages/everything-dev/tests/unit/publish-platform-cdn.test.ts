import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publishToFastKv } from "../../src/publish";
import type { BosConfig } from "../../src/types";

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

function makeConfigDir(withSession: { apiKey: string; accountId: string | null } | null): string {
  const dir = mkdtempSync(join(tmpdir(), "publish-cdn-"));
  activeDir = dir;
  writeFileSync(
    join(dir, "bos.config.json"),
    JSON.stringify({ account: "alice.near", domain: "citynode.app" }),
  );
  if (withSession) {
    mkdirSync(join(dir, ".bos"), { recursive: true });
    writeFileSync(
      join(dir, ".bos", "session.json"),
      JSON.stringify({
        version: 1,
        credential: {
          kind: "session",
          apiKey: withSession.apiKey,
          apiKeyId: "key-1",
          accountId: withSession.accountId,
          label: "test",
          siteUrl: "http://localhost:9999",
          createdAt: new Date().toISOString(),
          expiresAt: null,
        },
        publishKey: null,
        delegateKey: null,
      }),
    );
  }
  return dir;
}

function platformPublishInput(configDir: string, cdn?: "platform") {
  return {
    bosConfig: {
      account: "alice.near",
      domain: "citynode.app",
      deploy: { cdn: "platform" },
    } as BosConfig,
    runtimeConfig: null,
    configDir,
    env: "production" as const,
    build: true,
    dryRun: false,
    verbose: false,
    packages: "all",
    cdn,
  };
}

describe("publishToFastKv platform CDN", () => {
  it("refuses to run with deploy.cdn = platform and no CLI session", async () => {
    const configDir = makeConfigDir(null);
    const result = await publishToFastKv(platformPublishInput(configDir));
    expect(result.status).toBe("error");
    expect(result.error).toContain("Run bos login");
  });

  it("refuses when the session account does not match the configured account", async () => {
    const configDir = makeConfigDir({ apiKey: "edk_test", accountId: "mallory.near" });
    const result = await publishToFastKv(platformPublishInput(configDir));
    expect(result.status).toBe("error");
    expect(result.error).toContain("pinned to the session's NEAR account");
  });

  it("accepts the --cdn flag as an override (missing session still errors)", async () => {
    const configDir = makeConfigDir(null);
    const input = platformPublishInput(configDir);
    delete (input.bosConfig as { deploy?: unknown }).deploy;
    const result = await publishToFastKv({ ...input, cdn: "platform" });
    expect(result.status).toBe("error");
    expect(result.error).toContain("Run bos login");
  });
});
