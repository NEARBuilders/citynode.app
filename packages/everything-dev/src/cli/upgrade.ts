import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { glob } from "glob";
import type { UpgradeOptions, UpgradeResult } from "../contract";
import { runBunInstall, runTypesGen } from "./init";
import { syncTemplate } from "./sync";

const FRAMEWORK_PACKAGES = ["everything-dev", "every-plugin"];

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
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  const version = deps[packageName] || devDeps[packageName];
  if (!version) return undefined;
  return version.replace(/^[\^~>=]+/, "");
}

function isBumpedableVersion(value: string | undefined): boolean {
  if (!value) return false;
  if (value === "workspace:*") return false;
  if (value.startsWith("catalog:")) return false;
  return true;
}

function bumpDepField(
  field: Record<string, string> | undefined,
  packageName: string,
  newVersion: string,
): boolean {
  if (!field) return false;
  if (!(packageName in field)) return false;
  const current = field[packageName];
  if (!isBumpedableVersion(current)) return false;
  field[packageName] = `^${newVersion}`;
  return true;
}

function bumpCatalog(
  catalog: Record<string, string> | undefined,
  packageName: string,
  newVersion: string,
): boolean {
  if (!catalog) return false;
  if (!(packageName in catalog)) return false;
  const current = catalog[packageName];
  if (!isBumpedableVersion(current)) return false;
  catalog[packageName] = `^${newVersion}`;
  return true;
}

interface BumpResult {
  modified: boolean;
  fields: string[];
}

function bumpPackageJson(
  pkg: Record<string, unknown>,
  packageName: string,
  newVersion: string,
): BumpResult {
  const fields: string[] = [];

  for (const fieldName of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const field = pkg[fieldName] as Record<string, string> | undefined;
    if (bumpDepField(field, packageName, newVersion)) {
      fields.push(fieldName);
    }
  }

  const workspaces = pkg.workspaces as { catalog?: Record<string, string> } | undefined;
  if (workspaces?.catalog && bumpCatalog(workspaces.catalog, packageName, newVersion)) {
    fields.push("workspaces.catalog");
  }

  return { modified: fields.length > 0, fields };
}

function updatePackageVersionInFile(
  filePath: string,
  packageName: string,
  newVersion: string,
): boolean {
  const pkg = JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  const result = bumpPackageJson(pkg, packageName, newVersion);
  if (result.modified) {
    writeFileSync(filePath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return result.modified;
}

function updatePackageVersion(
  projectDir: string,
  packageName: string,
  newVersion: string,
): boolean {
  return updatePackageVersionInFile(join(projectDir, "package.json"), packageName, newVersion);
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
      updatePackageVersion(projectDir, pkg.name, pkg.to);
    }
  }

  const workspacePkgPaths = await findWorkspacePackageJsons(projectDir);
  for (const pkgPath of workspacePkgPaths) {
    for (const pkg of packages) {
      if (pkg.from !== undefined && pkg.from !== pkg.to) {
        updatePackageVersionInFile(pkgPath, pkg.name, pkg.to);
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

  const migratedFiles: string[] = [];
  const obsoleteFiles = [
    "ui/src/lib/auth-client.ts",
    "ui/src/lib/session.ts",
  ];
  for (const file of obsoleteFiles) {
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
