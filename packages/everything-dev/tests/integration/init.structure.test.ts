import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyFilteredFiles, personalizeConfig, readTemplatekeep } from "../../src/cli/init";
import { loadManifestNormalizationSpec } from "../../src/internal/manifest-normalizer";

const REPO_ROOT = join(import.meta.dirname, "../../../../");
const MANIFEST_SPEC = loadManifestNormalizationSpec(REPO_ROOT);

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
    expect(patterns).toContain("ui/src/lib/api.ts");
  });

  it("copies only .templatekeep files", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    const filesCopied = await copyFilteredFiles(REPO_ROOT, testDir, patterns, {
      withHost: false,
    });

    expect(filesCopied).toBeGreaterThan(0);

    expect(existsSync(join(testDir, "bos.config.json"))).toBe(true);
    expect(existsSync(join(testDir, "api/src/contract.ts"))).toBe(true);
    expect(existsSync(join(testDir, "ui/src/lib/api.ts"))).toBe(true);
    expect(existsSync(join(testDir, "plugins/_template/src/index.ts"))).toBe(true);
    expect(existsSync(join(testDir, "plugins/registry/src/index.ts"))).toBe(false);
    expect(existsSync(join(testDir, "plugins/projects/src/index.ts"))).toBe(false);

    expect(existsSync(join(testDir, "host"))).toBe(false);
    expect(existsSync(join(testDir, "packages"))).toBe(false);
    expect(existsSync(join(testDir, "plans"))).toBe(false);
    expect(existsSync(join(testDir, ".changeset"))).toBe(true);
    expect(existsSync(join(testDir, "ui/src/routes/_layout/_authenticated/keys"))).toBe(false);
    expect(existsSync(join(testDir, "ui/src/routes/_layout/_authenticated/organizations"))).toBe(
      true,
    );
    expect(existsSync(join(testDir, "ui/src/routes/_layout/apps"))).toBe(true);
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

  it("preserves catalog refs for framework packages", () => {
    const rootPkg = JSON.parse(readFileSync(join(testDir, "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      workspaces?: { catalog?: Record<string, string> };
    };
    const uiPkg = JSON.parse(readFileSync(join(testDir, "ui", "package.json"), "utf-8")) as {
      devDependencies?: Record<string, string>;
    };
    const apiPkg = JSON.parse(readFileSync(join(testDir, "api", "package.json"), "utf-8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const pluginPkg = JSON.parse(
      readFileSync(join(testDir, "plugins", "_template", "package.json"), "utf-8"),
    ) as {
      devDependencies?: Record<string, string>;
    };

    expect(rootPkg.dependencies?.["everything-dev"]).toBe("catalog:");
    expect(rootPkg.dependencies?.["every-plugin"]).toBe("catalog:");
    expect(rootPkg.workspaces?.catalog?.["everything-dev"]).toBe(
      MANIFEST_SPEC.rootCatalog["everything-dev"],
    );
    expect(rootPkg.workspaces?.catalog?.["every-plugin"]).toBe(
      MANIFEST_SPEC.rootCatalog["every-plugin"],
    );
    expect(uiPkg.devDependencies?.["every-plugin"]).toBe("catalog:");
    expect(uiPkg.devDependencies?.["everything-dev"]).toBe("catalog:");
    expect(apiPkg.dependencies?.["every-plugin"]).toBe("catalog:");
    expect(apiPkg.devDependencies?.["everything-dev"]).toBe("catalog:");
    expect(pluginPkg.devDependencies?.["everything-dev"]).toBe("catalog:");
    expect(pluginPkg.devDependencies?.["every-plugin"]).toBe("catalog:");
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
      await personalizeConfig(hostTestDir, {
        extendsAccount: "dev.everything.near",
        extendsGateway: "everything.dev",
        account: "test.near",
        domain: "test.dev",
        workspaceOpts: { sourceDir: REPO_ROOT },
        withHost: true,
      });
      const hostPkg = JSON.parse(readFileSync(join(hostTestDir, "host", "package.json"), "utf-8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      expect(existsSync(join(hostTestDir, "host/src/program.ts"))).toBe(true);
      expect(hostPkg.devDependencies?.["everything-dev"]).toBe("catalog:");
      expect(hostPkg.dependencies?.["every-plugin"]).toBe("catalog:");
    } finally {
      rmSync(hostTestDir, { recursive: true, force: true });
    }
  });
});
