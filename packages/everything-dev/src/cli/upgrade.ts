import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";
import type { UpgradeOptions, UpgradeResult } from "../contract";
import { readInstalledFrameworkVersion } from "./framework-version";
import { runBunInstall, runTypesGen } from "./init";
import { syncTemplate } from "./sync";

const FRAMEWORK_PACKAGES = ["everything-dev", "every-plugin"];
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
];

interface NpmPackageInfo {
  version: string;
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
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) {
    return {
      status: "error",
      packages: [],
      error: "No package.json found in current directory",
    };
  }

  const packages: UpgradeResult["packages"] = [];

  for (const name of FRAMEWORK_PACKAGES) {
    const installed = readInstalledVersion(projectDir, name);
    const latest = await fetchLatestNpmVersion(name);

    if (!latest) {
      packages.push({ name, from: installed, to: installed ?? "unknown" });
      continue;
    }

    packages.push({ name, from: installed, to: latest });
  }

  const hasUpdates = packages.some((p) => p.from !== p.to && p.from !== undefined);

  if (options.dryRun) {
    let changelogUrl: string | undefined;
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
      packages,
      changelogUrl,
    };
  }

  for (const pkg of packages) {
    if (pkg.from !== undefined && pkg.from !== pkg.to) {
      updateRootPackageVersion(projectDir, pkg.name, pkg.to);
    }
  }

  const workspacePkgPaths = await findWorkspacePackageJsons(projectDir);
  for (const pkgPath of workspacePkgPaths) {
    for (const pkg of packages) {
      if (pkg.from !== undefined && pkg.from !== pkg.to) {
        updateWorkspacePackageRefInFile(pkgPath, pkg.name);
      }
    }
  }

  if (hasUpdates && !options.noInstall) {
    await runBunInstall(projectDir);
    await runTypesGen(projectDir);
  }

  let syncResult: UpgradeResult["sync"];
  if (!options.noSync) {
    syncResult = await syncTemplate(projectDir, {
      dryRun: false,
      force: options.force,
      noInstall: true,
    });
  }

  const migratedFiles = await rewriteLegacyUiImports(projectDir);
  for (const file of OBSOLETE_FILES) {
    const filePath = join(projectDir, file);
    if (existsSync(filePath)) {
      rmSync(filePath);
      migratedFiles.push(file);
    }
  }

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
    packages,
    sync: syncResult,
    migrated: migratedFiles.length > 0 ? migratedFiles : undefined,
    changelogUrl,
  };
}
