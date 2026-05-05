import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyFilteredFiles, personalizeConfig, readTemplatekeep } from "../../src/cli/init";

const REPO_ROOT = join(import.meta.dirname, "../../../../");

describe("bos init — structure", () => {
  let testDir: string;

  beforeAll(() => {
    testDir = mkdtempSync(join(tmpdir(), "bos-init-structure-"));
  });

  afterAll(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reads .templatekeep patterns", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns).toContain("bos.config.json");
    expect(patterns).toContain("ui/src/lib/auth-client.ts");
  });

  it("copies only .templatekeep files", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    const filesCopied = await copyFilteredFiles(REPO_ROOT, testDir, patterns, {
      withHost: false,
    });

    expect(filesCopied).toBeGreaterThan(0);

    expect(existsSync(join(testDir, "bos.config.json"))).toBe(true);
    expect(existsSync(join(testDir, "api/src/contract.ts"))).toBe(true);
    expect(existsSync(join(testDir, "ui/src/lib/auth-client.ts"))).toBe(true);
    expect(existsSync(join(testDir, "plugins/_template/src/index.ts"))).toBe(true);
    expect(existsSync(join(testDir, "plugins/registry/src/index.ts"))).toBe(true);
    expect(existsSync(join(testDir, "plugins/projects/src/index.ts"))).toBe(true);

    expect(existsSync(join(testDir, "host"))).toBe(false);
    expect(existsSync(join(testDir, "packages"))).toBe(false);
    expect(existsSync(join(testDir, "plans"))).toBe(false);
    expect(existsSync(join(testDir, ".changeset"))).toBe(false);
    expect(existsSync(join(testDir, "ui/src/routes/_layout/_authenticated/keys"))).toBe(false);
    expect(existsSync(join(testDir, "ui/src/routes/_layout/_authenticated/organizations"))).toBe(
      false,
    );
    expect(existsSync(join(testDir, "ui/src/routes/_layout/_authenticated/projects"))).toBe(false);
  });

  it("personalizes bos.config.json", async () => {
    await personalizeConfig(testDir, {
      extendsAccount: "dev.everything.near",
      extendsGateway: "everything.dev",
      account: "test.near",
      domain: "test.dev",
      workspaceOpts: { sourceDir: REPO_ROOT },
    });

    const config = JSON.parse(readFileSync(join(testDir, "bos.config.json"), "utf-8"));
    expect(config.account).toBe("test.near");
    expect(config.domain).toBe("test.dev");
    expect(config.extends).toBe("bos://dev.everything.near/everything.dev");
  });

  it("removes production URLs", () => {
    const config = JSON.parse(readFileSync(join(testDir, "bos.config.json"), "utf-8"));
    expect(config.app.ui.production).toBeUndefined();
    expect(config.app.api.production).toBeUndefined();
    expect(config.app.ui.integrity).toBeUndefined();
    expect(config.app.api.integrity).toBeUndefined();
  });

  it("includes host when withHost is true", async () => {
    const hostTestDir = mkdtempSync(join(tmpdir(), "bos-init-host-"));
    try {
      const patterns = await readTemplatekeep(REPO_ROOT);
      const hostPatterns = [...patterns, "host/**"];
      await copyFilteredFiles(REPO_ROOT, hostTestDir, hostPatterns, { withHost: true });
      expect(existsSync(join(hostTestDir, "host/src/program.ts"))).toBe(true);
    } finally {
      rmSync(hostTestDir, { recursive: true, force: true });
    }
  });
});
