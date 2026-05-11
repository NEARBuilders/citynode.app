import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function stripVersionPrefix(version: string): string {
  return version.replace(/^[\^~>=]+/, "");
}

export function readRootCatalogVersion(
  projectDir: string,
  packageName: string,
): string | undefined {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
    workspaces?: { catalog?: Record<string, string> };
  };
  const version = pkg.workspaces?.catalog?.[packageName];
  return version ? stripVersionPrefix(version) : undefined;
}

export function readNodeModulesVersion(
  projectDir: string,
  packageName: string,
): string | undefined {
  const pkgPath = join(projectDir, "node_modules", packageName, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { version?: string };
  return pkg.version;
}

export function readInstalledFrameworkVersion(
  projectDir: string,
  packageName: string,
): string | undefined {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
  const deps = (pkg.dependencies ?? {}) as Record<string, string>;
  const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
  const version = deps[packageName] || devDeps[packageName];

  if (!version) {
    return (
      readRootCatalogVersion(projectDir, packageName) ??
      readNodeModulesVersion(projectDir, packageName)
    );
  }

  if (version.startsWith("catalog:")) {
    return (
      readRootCatalogVersion(projectDir, packageName) ??
      readNodeModulesVersion(projectDir, packageName)
    );
  }

  if (version.startsWith("workspace:") || version.startsWith("file:")) {
    return readNodeModulesVersion(projectDir, packageName);
  }

  return stripVersionPrefix(version);
}
