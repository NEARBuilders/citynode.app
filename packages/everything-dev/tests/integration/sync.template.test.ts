import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as infraModule from "../../src/cli/infra";
import * as initModule from "../../src/cli/init";
import {
  buildInitPatterns,
  copyFilteredFiles,
  personalizeConfig,
  writeInitSnapshot,
} from "../../src/cli/init";
import { syncTemplate } from "../../src/cli/sync";
import * as configModule from "../../src/config";

const REPO_ROOT = join(import.meta.dirname, "../../../../");
const ROOT_CONFIG = JSON.parse(readFileSync(join(REPO_ROOT, "bos.config.json"), "utf-8")) as {
  plugins?: Record<string, { routes?: string[] }>;
};

function pluginRoutesFromRoot(): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(ROOT_CONFIG.plugins ?? {}).map(([key, value]) => [key, value.routes ?? []]),
  );
}

function runtimePluginsFromRoot(): Record<string, { routes: string[] }> {
  return Object.fromEntries(
    Object.entries(ROOT_CONFIG.plugins ?? {}).map(([key, value]) => [
      key,
      { routes: value.routes ?? [] },
    ]),
  );
}

async function scaffoldProject(
  overrides: Array<"ui" | "api" | "host" | "plugins">,
  plugins?: string[],
): Promise<string> {
  const projectDir = mkdtempSync(join(tmpdir(), "bos-sync-template-"));
  const patterns = buildInitPatterns(overrides, plugins);
  const pluginRoutes = pluginRoutesFromRoot();

  await copyFilteredFiles(REPO_ROOT, projectDir, patterns, {
    overrides,
    plugins,
    pluginRoutes,
  });

  await personalizeConfig(projectDir, {
    extendsAccount: "dev.everything.near",
    extendsGateway: "everything.dev",
    account: "test.near",
    domain: "test.dev",
    overrides,
    plugins,
    pluginRoutes,
    workspaceOpts: { sourceDir: REPO_ROOT },
  });

  await writeInitSnapshot(
    projectDir,
    "dev.everything.near",
    "everything.dev",
    REPO_ROOT,
    patterns,
    {
      overrides,
      plugins,
      pluginRoutes,
    },
  );

  return projectDir;
}

describe("syncTemplate", () => {
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.spyOn(initModule, "resolveSourceDir").mockResolvedValue({
      sourceDir: REPO_ROOT,
      parentConfig: ROOT_CONFIG as never,
      cleanup: async () => {},
    });
    vi.spyOn(configModule, "loadConfig").mockImplementation(async ({ cwd }) => {
      if (cwd === REPO_ROOT) {
        return { runtime: { plugins: runtimePluginsFromRoot() } } as never;
      }
      return { runtime: { plugins: {} } } as never;
    });
    vi.spyOn(initModule, "runBunInstall").mockResolvedValue();
    vi.spyOn(initModule, "runTypesGen").mockResolvedValue();
    vi.spyOn(infraModule, "writeGeneratedInfra").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("updates framework-owned files and leaves non-framework files alone", async () => {
    const projectDir = await scaffoldProject(["ui", "api", "plugins"], ["apps"]);
    tempDirs.push(projectDir);

    const frameworkOwnedPath = join(projectDir, "ui", "src", "lib", "api.ts");
    const syncOwnedPath = join(projectDir, "ui", "src", "providers", "index.tsx");
    const appOwnedPath = join(projectDir, "ui", "src", "components", "user-nav.tsx");

    writeFileSync(frameworkOwnedPath, "framework override\n");
    writeFileSync(syncOwnedPath, "provider override\n");
    writeFileSync(appOwnedPath, "component override\n");

    const result = await syncTemplate(projectDir, {
      dryRun: false,
      force: false,
      noInstall: true,
    });

    expect(result.status).toBe("synced");
    expect(result.updated).toContain("ui/src/lib/api.ts");
    expect(result.updated).not.toContain("ui/src/providers/index.tsx");
    expect(result.skipped).not.toContain("ui/src/providers/index.tsx");
    expect(result.updated).not.toContain("ui/src/components/user-nav.tsx");
    expect(result.skipped).not.toContain("ui/src/components/user-nav.tsx");
    expect(readFileSync(frameworkOwnedPath, "utf-8")).toBe(
      readFileSync(join(REPO_ROOT, "ui", "src", "lib", "api.ts"), "utf-8"),
    );
    expect(readFileSync(syncOwnedPath, "utf-8")).toBe("provider override\n");
    expect(readFileSync(appOwnedPath, "utf-8")).toBe("component override\n");
    expect(existsSync(join(projectDir, ".bos", "sync-backup"))).toBe(true);
  });

  it("force sync still only updates framework-owned files", async () => {
    const projectDir = await scaffoldProject(["ui", "api"], []);
    tempDirs.push(projectDir);

    const syncOwnedPath = join(projectDir, "ui", "src", "providers", "index.tsx");
    writeFileSync(syncOwnedPath, "provider override\n");

    const result = await syncTemplate(projectDir, {
      dryRun: false,
      force: true,
      noInstall: true,
    });

    expect(result.status).toBe("synced");
    expect(result.updated).not.toContain("ui/src/providers/index.tsx");
    expect(result.skipped).not.toContain("ui/src/providers/index.tsx");
    expect(readFileSync(syncOwnedPath, "utf-8")).toBe("provider override\n");
  });

  it("sync does not re-add plugin workspaces because it only manages framework-owned files", async () => {
    const projectDir = await scaffoldProject(["ui", "api", "plugins"], ["apps"]);
    tempDirs.push(projectDir);

    const selectedPluginPackage = join(projectDir, "plugins", "apps", "package.json");
    unlinkSync(selectedPluginPackage);

    const result = await syncTemplate(projectDir, {
      dryRun: true,
      force: false,
      noInstall: true,
    });

    expect(result.status).toBe("dry-run");
    expect(result.added).not.toContain("plugins/apps/package.json");
    expect(result.added).not.toContain("plugins/settings/package.json");
  });

  it("preserves child root metadata and prunes stale local plugin entries during sync", async () => {
    const projectDir = await scaffoldProject(["ui", "api", "plugins"], ["apps"]);
    tempDirs.push(projectDir);

    const configPath = join(projectDir, "bos.config.json");
    const config = JSON.parse(readFileSync(configPath, "utf-8")) as {
      title?: string;
      repository?: string;
      description?: string;
      plugins?: Record<string, Record<string, unknown>>;
    };

    config.title = "child app";
    config.repository = "https://github.com/example/child-app";
    config.plugins = {
      ...(config.plugins ?? {}),
      settings: {
        development: "local:plugins/settings",
      },
    };
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

    const result = await syncTemplate(projectDir, {
      dryRun: false,
      force: false,
      noInstall: true,
    });

    expect(result.status).toBe("synced");

    const syncedConfig = JSON.parse(readFileSync(configPath, "utf-8")) as {
      title?: string;
      repository?: string;
      description?: string;
      plugins?: Record<string, Record<string, unknown>>;
    };

    expect(syncedConfig.title).toBe("child app");
    expect(syncedConfig.repository).toBe("https://github.com/example/child-app");
    expect(syncedConfig.description).toBeUndefined();
    expect(Object.keys(syncedConfig.plugins ?? {})).toEqual(["apps"]);
  });

  it("keeps the plugins workspace override when no child plugins are selected", async () => {
    const projectDir = await scaffoldProject(["ui", "api", "plugins"], []);
    tempDirs.push(projectDir);

    const result = await syncTemplate(projectDir, {
      dryRun: false,
      force: false,
      noInstall: true,
    });

    expect(result.status).toBe("synced");

    const pkg = JSON.parse(readFileSync(join(projectDir, "package.json"), "utf-8")) as {
      workspaces?: { packages?: string[] };
    };
    const config = JSON.parse(readFileSync(join(projectDir, "bos.config.json"), "utf-8")) as {
      plugins?: Record<string, unknown>;
    };

    expect(pkg.workspaces?.packages).toContain("plugins/*");
    expect(config.plugins).toBeUndefined();
  });
});
