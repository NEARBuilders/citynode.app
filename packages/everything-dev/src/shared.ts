import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BosEnv, type ResolvedConfigMeta, rebuildOrderedConfig } from "./merge";
import type { BosConfig, SharedDepConfig } from "./types";
import { BosConfigSchema } from "./types";

interface PackageJson {
  name?: string;
  private?: boolean;
  version?: string;
  workspaces?: {
    packages?: string[];
    catalog?: Record<string, string>;
  };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export interface SharedUiResolvedDep {
  name: string;
  version: string;
  requiredVersion: string;
  shareScope: string;
  singleton: boolean;
  eager: boolean;
  strictVersion: boolean;
}

export interface SharedUiResolved {
  deps: Record<string, SharedUiResolvedDep>;
  fingerprintSha256: string;
}

export interface SharedSyncResult {
  mode: "catalog->bos" | "bos->catalog";
  hostMode: "local" | "remote";
  bosConfigChanged: boolean;
  catalogChanged: boolean;
  generatedChanged: boolean;
  resolved: SharedUiResolved;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function extractSemverExact(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const match = input.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  return match ? match[0] : null;
}

function caretRange(version: string): string {
  return `^${version}`;
}

function stableDepsObject(
  deps: Record<string, SharedUiResolvedDep>,
): Record<string, SharedUiResolvedDep> {
  const keys = Object.keys(deps).sort((a, b) => a.localeCompare(b));
  const out: Record<string, SharedUiResolvedDep> = {};
  for (const k of keys) out[k] = deps[k]!;
  return out;
}

function writeFileIfChanged(filePath: string, nextContent: string): boolean {
  try {
    const current = readFileSync(filePath, "utf-8");
    if (current === nextContent) return false;
  } catch {
    // ignore
  }

  writeFileSync(filePath, nextContent);
  return true;
}

function fingerprintResolved(deps: Record<string, SharedUiResolvedDep>): string {
  const stable = stableDepsObject(deps);
  return sha256(JSON.stringify(stable));
}

function getSharedUiDeps(bosConfig: BosConfig): Record<string, SharedDepConfig> {
  const shared = bosConfig.shared ?? {};
  const ui = shared.ui ?? {};
  return ui;
}

export async function syncAndGenerateSharedUi(opts: {
  configDir: string;
  hostMode: "local" | "remote";
  bosConfig?: BosConfig;
  env?: BosEnv;
  extendsChain?: string[];
}): Promise<SharedSyncResult> {
  const bosConfigPath = join(opts.configDir, "bos.config.json");
  const resolvedConfigPath = join(opts.configDir, ".bos", "bos.resolved-config.json");
  const packageJsonPath = join(opts.configDir, "package.json");
  const generatedPath = join(opts.configDir, ".bos", "generated", "shared-ui.json");

  let bosConfig: BosConfig;
  if (opts.bosConfig) {
    bosConfig = opts.bosConfig;
  } else {
    const raw = JSON.parse(readFileSync(bosConfigPath, "utf-8")) as Record<string, unknown>;
    bosConfig = BosConfigSchema.parse(raw);
  }
  let pkgJson: PackageJson = {};
  try {
    pkgJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJson;
  } catch {
    // package.json might not exist
  }

  const originalBos = JSON.stringify(bosConfig);
  const originalPkg = JSON.stringify(pkgJson);

  const catalog = pkgJson?.workspaces?.catalog ?? {};
  const sharedUi = getSharedUiDeps(bosConfig);

  const mode = opts.hostMode === "local" ? "catalog->bos" : "bos->catalog";

  if (mode === "catalog->bos") {
    for (const [name, cfg] of Object.entries(sharedUi)) {
      const dep = cfg as SharedDepConfig;
      const version =
        catalog[name] ?? extractSemverExact(dep.version) ?? extractSemverExact(dep.requiredVersion);
      if (!version) continue;
      dep.version = version;
      dep.requiredVersion = caretRange(version);
      dep.shareScope = dep.shareScope ?? "default";
    }
  } else {
    for (const [name, cfg] of Object.entries(sharedUi)) {
      const dep = cfg as SharedDepConfig;
      const version = extractSemverExact(dep.version) ?? extractSemverExact(dep.requiredVersion);
      if (!version) continue;
      dep.version = version;
      dep.requiredVersion = caretRange(version);
      dep.shareScope = dep.shareScope ?? "default";
      if (catalog[name] !== version) {
        catalog[name] = version;
      }
    }
    if (!pkgJson.workspaces) pkgJson.workspaces = { packages: [], catalog: {} };
    pkgJson.workspaces.catalog = catalog;
  }

  const nextBos = JSON.stringify(bosConfig);
  const nextPkg = JSON.stringify(pkgJson);
  const bosConfigChanged = nextBos !== originalBos;
  const catalogChanged = nextPkg !== originalPkg;

  if (bosConfigChanged) {
    if (mode === "catalog->bos") {
      const resolvedDir = dirname(resolvedConfigPath);
      if (!existsSync(resolvedDir)) {
        mkdirSync(resolvedDir, { recursive: true });
      }
      const ordered = rebuildOrderedConfig(bosConfig);
      const meta: ResolvedConfigMeta = {
        env: opts.env ?? "development",
        resolvedAt: new Date().toISOString(),
        extendsChain: opts.extendsChain ?? [],
        source: "shared-sync",
      };
      const resolvedOutput = {
        _resolved: meta,
        ...ordered,
      };
      writeFileIfChanged(resolvedConfigPath, `${JSON.stringify(resolvedOutput, null, 2)}\n`);
    } else {
      writeFileIfChanged(bosConfigPath, `${JSON.stringify(bosConfig, null, 2)}\n`);
    }
  }
  if (catalogChanged) {
    writeFileIfChanged(packageJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
  }

  const resolvedDeps: Record<string, SharedUiResolvedDep> = {};
  for (const [name, cfg] of Object.entries(getSharedUiDeps(bosConfig))) {
    const version =
      catalog[name] ?? extractSemverExact(cfg.version) ?? extractSemverExact(cfg.requiredVersion);
    if (!version) continue;
    resolvedDeps[name] = {
      name,
      version,
      requiredVersion: caretRange(version),
      shareScope: cfg.shareScope ?? "default",
      singleton: cfg.singleton ?? false,
      eager: cfg.eager ?? false,
      strictVersion: cfg.strictVersion ?? false,
    };
  }

  const stableResolvedDeps = stableDepsObject(resolvedDeps);
  const resolved: SharedUiResolved = {
    deps: stableResolvedDeps,
    fingerprintSha256: fingerprintResolved(stableResolvedDeps),
  };

  const nextGenerated = {
    schemaVersion: 1,
    kind: "everything-dev/shared-ui",
    generatedAt: new Date().toISOString(),
    ui: {
      deps: stableResolvedDeps,
      fingerprintSha256: resolved.fingerprintSha256,
    },
    inputs: {
      mode,
      hostMode: opts.hostMode,
    },
  };

  let prevFingerprint: string | null = null;
  try {
    const prev = JSON.parse(readFileSync(generatedPath, "utf-8"));
    prevFingerprint = prev?.ui?.fingerprintSha256 ?? null;
  } catch {
    // ignore
  }

  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileIfChanged(generatedPath, `${JSON.stringify(nextGenerated, null, 2)}\n`);

  const generatedChanged = prevFingerprint !== nextGenerated.ui.fingerprintSha256;

  return {
    mode,
    hostMode: opts.hostMode,
    bosConfigChanged,
    catalogChanged,
    generatedChanged,
    resolved,
  };
}

export function loadGeneratedSharedUi(configDir: string): SharedUiResolved | null {
  const generatedPath = join(configDir, ".bos", "generated", "shared-ui.json");
  try {
    const content = JSON.parse(readFileSync(generatedPath, "utf-8"));
    return content?.ui ?? null;
  } catch {
    return null;
  }
}
