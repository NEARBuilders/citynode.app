import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { UpgradeOptions, UpgradeResult } from "../contract";
import { runBunInstall } from "./init";
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

function updatePackageVersion(projectDir: string, packageName: string, newVersion: string): void {
  const pkgPath = join(projectDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;

  if (pkg.dependencies && typeof pkg.dependencies === "object") {
    const deps = pkg.dependencies as Record<string, string>;
    if (deps[packageName] !== undefined) {
      deps[packageName] = `^${newVersion}`;
    }
  }

  if (pkg.devDependencies && typeof pkg.devDependencies === "object") {
    const deps = pkg.devDependencies as Record<string, string>;
    if (deps[packageName] !== undefined) {
      deps[packageName] = `^${newVersion}`;
    }
  }

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
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

  if (hasUpdates && !options.noInstall) {
    await runBunInstall(projectDir);
  }

  let syncResult: UpgradeResult["sync"];
  if (!options.noSync) {
    syncResult = await syncTemplate(projectDir, {
      dryRun: false,
      force: options.force,
      noInstall: true,
    });
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
    changelogUrl,
  };
}
