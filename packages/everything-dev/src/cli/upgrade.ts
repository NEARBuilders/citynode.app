import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import * as p from "@clack/prompts";
import { glob } from "glob";
import type { PhaseTiming, UpgradeOptions, UpgradeResult } from "../contract";
import { resolveExtendsRef } from "../merge";
import { saveBosConfig } from "../utils/save-config";
import { readInstalledFrameworkVersion } from "./framework-version";
import { fetchParentConfig, runBunInstall, runTypesGen } from "./init";
import { syncTemplate } from "./sync";
import { timePhase } from "./timing";

const FRAMEWORK_PACKAGES = ["everything-dev", "every-plugin"];

const CATALOG_TOOL_PACKAGES = [
  "@rspack/core",
  "@rspack/cli",
  "@rsbuild/core",
  "@rsbuild/plugin-react",
  "@module-federation/enhanced",
  "@module-federation/node",
  "@module-federation/rsbuild-plugin",
  "@module-federation/runtime-core",
  "@module-federation/sdk",
  "@module-federation/dts-plugin",
] as const;
const LEGACY_UI_IMPORT_REWRITES = [
  ['from "@/auth"', 'from "@/app"'],
  ["from '@/auth'", "from '@/app'"],
  ['from "@/lib/use-api-client"', 'from "@/app"'],
  ["from '@/lib/use-api-client'", "from '@/app'"],
  ['from "@/lib/api-client"', 'from "@/app"'],
  ["from '@/lib/api-client'", "from '@/app'"],
] as const;
const OBSOLETE_FILES = [
  "ui/src/auth.ts",
  "ui/src/auth-types.gen.ts",
  "ui/src/lib/api-client.ts",
  "ui/src/lib/use-api-client.ts",
  "ui/src/api-contract.ts",
  "ui/src/api-contract.gen.ts",
  "ui/src/lib/auth-client.ts",
  "ui/src/lib/session.ts",
  "ui/scripts/generate-metadata.ts",
  ".github/dependabot.yml",
  ".github/templates/dependabot.yml",
  "packages/everything-dev/cli.js",
];

interface NpmPackageInfo {
  version: string;
}

function getExtendsRef(config: Record<string, unknown>): string | undefined {
  if (typeof config.extends === "string") {
    return config.extends;
  }

  if (config.extends && typeof config.extends === "object") {
    return resolveExtendsRef(config.extends as Record<string, string>, "production");
  }

  return undefined;
}

function parseBosRef(ref: string): { account: string; gateway: string } | null {
  const match = ref.match(/^bos:\/\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match[2]) return null;
  return { account: match[1], gateway: match[2] };
}

async function loadParentPluginOptions(projectDir: string): Promise<{
  localConfig: Record<string, unknown>;
  parentPlugins: Record<string, unknown>;
  newPluginKeys: string[];
} | null> {
  const configPath = join(projectDir, "bos.config.json");
  if (!existsSync(configPath)) {
    return null;
  }

  const localConfig = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;
  const extendsRef = getExtendsRef(localConfig);
  if (!extendsRef?.startsWith("bos://")) {
    return null;
  }

  const parsed = parseBosRef(extendsRef);
  if (!parsed) {
    return null;
  }

  let parentConfig: Record<string, unknown>;
  try {
    parentConfig = await fetchParentConfig(parsed.account, parsed.gateway);
  } catch {
    return null;
  }

  const parentPlugins =
    parentConfig.plugins && typeof parentConfig.plugins === "object"
      ? (parentConfig.plugins as Record<string, unknown>)
      : {};
  const localPlugins =
    localConfig.plugins && typeof localConfig.plugins === "object"
      ? (localConfig.plugins as Record<string, unknown>)
      : {};

  const newPluginKeys = Object.keys(parentPlugins).filter((key) => !(key in localPlugins));
  return { localConfig, parentPlugins, newPluginKeys };
}

async function addSelectedParentPlugins(projectDir: string): Promise<string[]> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return [];
  }

  const pluginOptions = await loadParentPluginOptions(projectDir);
  if (!pluginOptions || pluginOptions.newPluginKeys.length === 0) {
    return [];
  }

  const selectedValue = await p.multiselect({
    message: "Select new plugins from parent:",
    options: pluginOptions.newPluginKeys.map((key) => ({ value: key, label: key })),
    required: false,
  });

  if (p.isCancel(selectedValue)) {
    process.exit(0);
  }

  const selected = selectedValue as string[];
  if (selected.length === 0) {
    return [];
  }

  const localPlugins =
    pluginOptions.localConfig.plugins && typeof pluginOptions.localConfig.plugins === "object"
      ? (pluginOptions.localConfig.plugins as Record<string, unknown>)
      : {};
  const nextPlugins = { ...localPlugins };
  for (const key of selected) {
    nextPlugins[key] = pluginOptions.parentPlugins[key];
  }

  pluginOptions.localConfig.plugins = nextPlugins;
  await saveBosConfig(projectDir, pluginOptions.localConfig);

  return selected;
}

async function fetchLatestNpmVersion(packageName: string): Promise<string | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as NpmPackageInfo;
    return data.version;
  } catch {
    return null;
  }
}

function readInstalledVersion(projectDir: string, packageName: string): string | undefined {
  return readInstalledFrameworkVersion(projectDir, packageName);
}

function setCatalogRef(field: Record<string, string> | undefined, packageName: string): boolean {
  if (!field || !(packageName in field)) return false;
  if (field[packageName] === "catalog:" || field[packageName].startsWith("file:")) return false;
  field[packageName] = "catalog:";
  return true;
}

function updateWorkspacePackageRefInFile(filePath: string, packageName: string): boolean {
  const pkg = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  let modified = false;

  for (const fieldName of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const field = pkg[fieldName] as Record<string, string> | undefined;
    if (setCatalogRef(field, packageName)) {
      modified = true;
    }
  }

  if (modified) {
    writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return modified;
}

function updateRootPackageVersion(
  projectDir: string,
  packageName: string,
  newVersion: string,
): boolean {
  const pkgPath = join(projectDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  let modified = false;

  for (const fieldName of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const field = pkg[fieldName] as Record<string, string> | undefined;
    if (setCatalogRef(field, packageName)) {
      modified = true;
    }
  }

  if (!pkg.workspaces || typeof pkg.workspaces !== "object") {
    pkg.workspaces = { packages: [], catalog: {} };
    modified = true;
  }

  const workspaces = pkg.workspaces as { packages?: string[]; catalog?: Record<string, string> };
  if (!workspaces.catalog || typeof workspaces.catalog !== "object") {
    workspaces.catalog = {};
    modified = true;
  }

  const nextVersion = `^${newVersion}`;
  if (workspaces.catalog[packageName] !== nextVersion) {
    workspaces.catalog[packageName] = nextVersion;
    modified = true;
  }

  if (modified) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  return modified;
}

function updateRootCatalogVersion(
  projectDir: string,
  packageName: string,
  newVersion: string,
): boolean {
  const pkgPath = join(projectDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;

  if (!pkg.workspaces || typeof pkg.workspaces !== "object") {
    pkg.workspaces = { packages: [], catalog: {} };
  }
  const workspaces = pkg.workspaces as { packages?: string[]; catalog?: Record<string, string> };
  if (!workspaces.catalog || typeof workspaces.catalog !== "object") {
    workspaces.catalog = {};
  }

  const nextVersion = `^${newVersion}`;
  if (workspaces.catalog[packageName] === nextVersion) return false;

  workspaces.catalog[packageName] = nextVersion;
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  return true;
}

async function findWorkspacePackageJsons(projectDir: string): Promise<string[]> {
  const rootPkgPath = join(projectDir, "package.json");
  if (!existsSync(rootPkgPath)) return [];

  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8")) as Record<string, unknown>;
  const workspaceConfig = rootPkg.workspaces as { packages?: string[] } | string[] | undefined;

  const patterns: string[] = [];
  if (Array.isArray(workspaceConfig)) {
    patterns.push(...workspaceConfig);
  } else if (workspaceConfig?.packages && Array.isArray(workspaceConfig.packages)) {
    patterns.push(...workspaceConfig.packages);
  }

  if (patterns.length === 0) return [];

  const pkgPaths: string[] = [];
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd: projectDir, dot: false, absolute: false });
    for (const match of matches) {
      const pkgPath = join(projectDir, match, "package.json");
      if (existsSync(pkgPath) && statSync(pkgPath).isFile()) {
        pkgPaths.push(pkgPath);
      }
    }
  }

  return [...new Set(pkgPaths)];
}

function buildChangelogUrl(
  oldVersion: string | undefined,
  newVersion: string,
  parentConfig: Record<string, unknown> | null,
): string | undefined {
  if (!oldVersion || oldVersion === newVersion) return undefined;
  const repoUrl = parentConfig?.repository as string | undefined;
  if (!repoUrl) return undefined;

  const githubMatch = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!githubMatch) return undefined;

  const [, owner, repo] = githubMatch;
  return `https://github.com/${owner}/${repo}/compare/v${oldVersion}...v${newVersion}`;
}

async function rewriteLegacyUiImports(projectDir: string): Promise<string[]> {
  const files = await glob("ui/src/**/*.{ts,tsx}", {
    cwd: projectDir,
    nodir: true,
    dot: false,
    absolute: false,
  });
  const migrated: string[] = [];

  for (const file of files) {
    const filePath = join(projectDir, file);
    const original = readFileSync(filePath, "utf-8");
    let next = original;

    for (const [from, to] of LEGACY_UI_IMPORT_REWRITES) {
      next = next.replaceAll(from, to);
    }

    if (next !== original) {
      writeFileSync(filePath, next);
      migrated.push(file);
    }
  }

  return migrated;
}

export async function upgradeTemplate(
  projectDir: string,
  options: UpgradeOptions,
): Promise<UpgradeResult> {
  const timings: PhaseTiming[] = [];
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    return {
      status: "error",
      packages: [],
      timings,
      error: "No package.json found in current directory",
    };
  }

  const { packages, catalogVersionUpdates } = await timePhase(
    timings,
    "check package versions",
    async () => {
      const nextPackages: UpgradeResult["packages"] = [];

      for (const name of FRAMEWORK_PACKAGES) {
        const installed = readInstalledVersion(projectDir, name);
        const latest = await fetchLatestNpmVersion(name);

        if (!latest) {
          nextPackages.push({ name, from: installed, to: installed ?? "unknown" });
          continue;
        }

        nextPackages.push({ name, from: installed, to: latest });
      }

      const nextCatalogVersionUpdates: Array<{
        name: string;
        from: string | undefined;
        to: string;
      }> = [];
      for (const name of CATALOG_TOOL_PACKAGES) {
        const installed = readInstalledVersion(projectDir, name);
        if (!installed) continue;
        const latest = await fetchLatestNpmVersion(name);
        if (!latest) continue;
        if (installed === latest) continue;
        nextCatalogVersionUpdates.push({ name, from: installed, to: latest });
      }

      return { packages: nextPackages, catalogVersionUpdates: nextCatalogVersionUpdates };
    },
  );

  const hasFrameworkUpdates = packages.some((p) => p.from !== p.to && p.from !== undefined);
  const hasCatalogUpdates = catalogVersionUpdates.length > 0;
  const hasUpdates = hasFrameworkUpdates || hasCatalogUpdates;

  if (options.dryRun) {
    let changelogUrl: string | undefined;
    const pluginOptions = options.noSync
      ? null
      : await timePhase(timings, "discover parent plugins", () =>
          loadParentPluginOptions(projectDir),
        );
    if (hasUpdates) {
      const configPath = join(projectDir, "bos.config.json");
      let parentConfig: Record<string, unknown> | null = null;
      if (existsSync(configPath)) {
        try {
          parentConfig = JSON.parse(readFileSync(configPath, "utf-8"));
        } catch {}
      }
      const mainPkg = packages.find((p) => p.name === "everything-dev");
      if (mainPkg?.from && mainPkg.from !== mainPkg.to) {
        changelogUrl = buildChangelogUrl(mainPkg.from, mainPkg.to, parentConfig);
      }
    }

    return {
      status: "dry-run",
      packages: [
        ...packages,
        ...catalogVersionUpdates.map((u) => ({ name: u.name, from: u.from, to: u.to })),
      ],
      availablePlugins: pluginOptions?.newPluginKeys,
      timings,
      changelogUrl,
    };
  }

  await timePhase(timings, "apply package updates", async () => {
    for (const pkg of packages) {
      if (pkg.from !== undefined && pkg.from !== pkg.to) {
        updateRootPackageVersion(projectDir, pkg.name, pkg.to);
      }
    }

    for (const update of catalogVersionUpdates) {
      updateRootCatalogVersion(projectDir, update.name, update.to);
    }

    const workspacePkgPaths = await findWorkspacePackageJsons(projectDir);
    for (const pkgPath of workspacePkgPaths) {
      for (const pkg of packages) {
        if (pkg.from !== undefined && pkg.from !== pkg.to) {
          updateWorkspacePackageRefInFile(pkgPath, pkg.name);
        }
      }
      for (const update of catalogVersionUpdates) {
        updateWorkspacePackageRefInFile(pkgPath, update.name);
      }
    }
  });

  let syncResult: UpgradeResult["sync"];
  let addedPlugins: string[] = [];
  if (!options.noSync) {
    addedPlugins = await timePhase(timings, "discover parent plugins", async () => {
      if (options.dryRun) return [];
      return addSelectedParentPlugins(projectDir);
    });

    syncResult = await timePhase(timings, "sync template", () =>
      syncTemplate(projectDir, {
        dryRun: false,
        force: options.force,
        noInstall: true,
      }),
    );
  }

  if ((hasUpdates || addedPlugins.length > 0) && !options.noInstall) {
    await timePhase(timings, "install dependencies", () => runBunInstall(projectDir));
    await timePhase(timings, "generate types", () => runTypesGen(projectDir));
  }

  const migratedFiles = await timePhase(timings, "clean obsolete files", async () => {
    const nextMigratedFiles = await rewriteLegacyUiImports(projectDir);
    for (const file of OBSOLETE_FILES) {
      const filePath = join(projectDir, file);
      if (existsSync(filePath)) {
        rmSync(filePath);
        nextMigratedFiles.push(file);
      }
    }
    return nextMigratedFiles;
  });

  let changelogUrl: string | undefined;
  const mainPkg = packages.find((p) => p.name === "everything-dev");
  if (mainPkg?.from && mainPkg.from !== mainPkg.to) {
    const configPath = join(projectDir, "bos.config.json");
    let parentConfig: Record<string, unknown> | null = null;
    if (existsSync(configPath)) {
      try {
        parentConfig = JSON.parse(readFileSync(configPath, "utf-8"));
      } catch {}
    }
    changelogUrl = buildChangelogUrl(mainPkg.from, mainPkg.to, parentConfig);
  }

  return {
    status: "upgraded",
    packages: [
      ...packages,
      ...catalogVersionUpdates.map((u) => ({ name: u.name, from: u.from, to: u.to })),
    ],
    sync: syncResult,
    migrated: migratedFiles.length > 0 ? migratedFiles : undefined,
    selectedPlugins: addedPlugins.length > 0 ? addedPlugins : undefined,
    timings,
    changelogUrl,
  };
}
