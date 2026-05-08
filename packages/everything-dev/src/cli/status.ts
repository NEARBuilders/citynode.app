import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { StatusResult } from "../contract";
import { fetchBosConfigFromFastKv } from "../fastkv";
import { readSnapshot } from "./snapshot";

const FRAMEWORK_PACKAGES = ["everything-dev", "every-plugin"];

async function fetchLatestNpmVersion(packageName: string): Promise<string | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { version: string };
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
  if (
    version.startsWith("workspace:") ||
    version.startsWith("catalog:") ||
    version.startsWith("file:")
  ) {
    return undefined;
  }
  return version.replace(/^[\^~>=]+/, "");
}

function checkEnvFile(projectDir: string): "found" | "missing" | "example-only" {
  if (existsSync(join(projectDir, ".env"))) return "found";
  if (existsSync(join(projectDir, ".env.example"))) return "example-only";
  return "missing";
}

async function checkParentReachable(extendsRef: string | undefined): Promise<boolean | undefined> {
  if (!extendsRef?.startsWith("bos://")) return undefined;
  try {
    const config = await fetchBosConfigFromFastKv(extendsRef);
    return config !== null;
  } catch {
    return false;
  }
}

export async function getStatus(projectDir: string): Promise<StatusResult> {
  const configPath = join(projectDir, "bos.config.json");
  if (!existsSync(configPath)) {
    return {
      status: "error",
      error: "No bos.config.json found in current directory",
      packages: [],
      envFile: "missing",
    };
  }

  const config = JSON.parse(readFileSync(configPath, "utf-8")) as Record<string, unknown>;

  const packages = [];
  for (const name of FRAMEWORK_PACKAGES) {
    const installed = readInstalledVersion(projectDir, name);
    const latest = await fetchLatestNpmVersion(name);
    packages.push({ name, installed, latest: latest ?? undefined });
  }

  const snapshot = await readSnapshot(projectDir);

  const extendsRef = config.extends as string | undefined;
  const parentReachable = await checkParentReachable(extendsRef);

  return {
    status: "ok",
    extends: extendsRef,
    account: config.account as string | undefined,
    domain: config.domain as string | undefined,
    packages,
    lastSync: snapshot?.timestamp,
    envFile: checkEnvFile(projectDir),
    parentReachable,
  };
}
