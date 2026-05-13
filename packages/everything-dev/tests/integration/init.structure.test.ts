import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { copyFilteredFiles, personalizeConfig, readTemplatekeep } from "../../src/cli/init";
import { loadManifestNormalizationSpec } from "../../src/internal/manifest-normalizer";

const REPO_ROOT = join(import.meta.dirname, "../../../../");
const MANIFEST_SPEC = loadManifestNormalizationSpec(REPO_ROOT);

const DEFAULT_OVERRIDES = ["ui", "api"] as const;

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

  it("copies only .templatekeep files for default overrides (ui, api)", async () => {
    const patterns = await readTemplatekeep(REPO_ROOT);
    const filesCopied = await copyFilteredFiles(REPO_ROOT, testDir, patterns, {
      overrides: [...DEFAULT_OVERRIDES],
    });

    expect(filesCopied).toBeGreaterThan(0);

    expect(existsSync(join(testDir, "bos.config.json"))).toBe(true);
    expect(existsSync(join(testDir, "api/src/contract.ts"))).toBe(true);
    expect(existsSync(join(testDir, "ui/src/lib/api.ts"))).toBe(true);

    expect(existsSync(join(testDir, "plugins/settings"))).toBe(false);
    expect(existsSync(join(testDir, "plugins/apps"))).toBe(false);
    expect(existsSync(join(testDir, "plugins/projects"))).toBe(false);

    expect(existsSync(join(testDir, "host"))).toBe(false);
    expect(existsSync(join(testDir, "packages"))).toBe(false);
    expect(existsSync(join(testDir, "plans"))).toBe(false);
    expect(existsSync(join(testDir, ".changeset"))).toBe(true);
  });

  it("copies selected plugin directories when plugins override is active", async () => {
    const selectedDir = mkdtempSync(join(tmpdir(), "bos-init-selected-plugins-"));
    try {
      const parent = JSON.parse(readFileSync(join(REPO_ROOT, "bos.config.json"), "utf-8"));
      const pluginRoutes = Object.fromEntries(
        Object.entries(parent.plugins as Record<string, { routes?: string[] }>).map(
          ([key, value]) => [key, value.routes ?? []],
        ),
      );
      const patterns = await readTemplatekeep(REPO_ROOT);
      await copyFilteredFiles(REPO_ROOT, selectedDir, patterns, {
        overrides: ["ui", "api", "plugins"],
        plugins: ["apps", "projects"],
        pluginRoutes,
      });

      expect(existsSync(join(selectedDir, "plugins", "apps"))).toBe(true);
      expect(existsSync(join(selectedDir, "plugins", "projects"))).toBe(true);
      expect(existsSync(join(selectedDir, "plugins", "settings"))).toBe(false);
    } finally {
      rmSync(selectedDir, { recursive: true, force: true });
    }
  });

  it("completes init cleanly when no plugins are selected within plugins override", async () => {
    const noPluginsDir = mkdtempSync(join(tmpdir(), "bos-init-no-plugins-"));
    try {
      const parent = JSON.parse(readFileSync(join(REPO_ROOT, "bos.config.json"), "utf-8"));
      const pluginRoutes = Object.fromEntries(
        Object.entries(parent.plugins as Record<string, { routes?: string[] }>).map(
          ([key, value]) => [key, value.routes ?? []],
        ),
      );
      const patterns = await readTemplatekeep(REPO_ROOT);
      await copyFilteredFiles(REPO_ROOT, noPluginsDir, patterns, {
        overrides: ["ui", "api", "plugins"],
        plugins: [],
        pluginRoutes,
      });
      await personalizeConfig(noPluginsDir, {
        extendsAccount: "dev.everything.near",
        extendsGateway: "everything.dev",
        account: "test.near",
        domain: "test.dev",
        plugins: [],
        overrides: ["ui", "api", "plugins"],
        pluginRoutes,
        workspaceOpts: { sourceDir: REPO_ROOT },
      });

      expect(existsSync(join(noPluginsDir, "plugins"))).toBe(false);

      const config = JSON.parse(readFileSync(join(noPluginsDir, "bos.config.json"), "utf-8"));
      expect(config.plugins).toEqual({});

      const pkg = JSON.parse(readFileSync(join(noPluginsDir, "package.json"), "utf-8")) as {
        workspaces?: { packages?: string[] };
      };
      expect(pkg.workspaces?.packages).not.toContain("plugins/*");
    } finally {
      rmSync(noPluginsDir, { recursive: true, force: true });
    }
  });

  it("personalizes bos.config.json removing non-overridden app sections", async () => {
    await personalizeConfig(testDir, {
      extendsAccount: "dev.everything.near",
      extendsGateway: "everything.dev",
      account: "test.near",
      domain: "test.dev",
      workspaceOpts: { sourceDir: REPO_ROOT },
      overrides: [...DEFAULT_OVERRIDES],
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
  });

  it("removes production URLs from overridden app sections", () => {
    const config = JSON.parse(readFileSync(join(testDir, "bos.config.json"), "utf-8"));
    expect(config.app.ui.production).toBeUndefined();
    expect(config.app.api.production).toBeUndefined();
    expect(config.app.ui.integrity).toBeUndefined();
    expect(config.app.api.integrity).toBeUndefined();
  });

  it("includes host when overrides includes host", async () => {
    const hostTestDir = mkdtempSync(join(tmpdir(), "bos-init-host-"));
    try {
      const patterns = await readTemplatekeep(REPO_ROOT);
      const hostPatterns = [...patterns, "host/**"];
      await copyFilteredFiles(REPO_ROOT, hostTestDir, hostPatterns, {
        overrides: ["ui", "api", "host"],
      });
      await personalizeConfig(hostTestDir, {
        extendsAccount: "dev.everything.near",
        extendsGateway: "everything.dev",
        account: "test.near",
        domain: "test.dev",
        workspaceOpts: { sourceDir: REPO_ROOT },
        overrides: ["ui", "api", "host"],
      });
      const hostPkg = JSON.parse(
        readFileSync(join(hostTestDir, "host", "package.json"), "utf-8"),
      ) as {
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
