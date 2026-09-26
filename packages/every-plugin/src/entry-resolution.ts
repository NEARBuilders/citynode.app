import fs from "node:fs";
import path from "node:path";

export const PLUGIN_ENTRY = "api/src/index.ts";
export const PLUGIN_CONTRACT = "api/src/contract.ts";
export const BOS_DEV_CONFIG = "bos.dev.ts";
const SLOT_ENTRY = "src/index.ts";
const SLOT_CONTRACT = "src/contract.ts";
const LEGACY_ENTRY = "src/index.ts";
const LEGACY_CONTRACT = "src/contract.ts";
const LEGACY_DEV_CONFIG = "plugin.dev.ts";

export function findBosConfigPath(from: string = process.cwd()): string | null {
  let current = path.resolve(from);
  while (true) {
    const candidate = path.join(current, "bos.config.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

const migrationHint = (workspace: string, from: string, to: string) =>
  `[every-plugin] ${workspace} uses the removed ${from} layout — v2 requires ${to}. ` +
  `Migrate: mkdir api && git mv src api/src (and rename ${LEGACY_DEV_CONFIG} to ${BOS_DEV_CONFIG} if present)`;

/**
 * True when `cwd` is the App's own api workspace slot — the ADR 0005 root
 * shape where the workspace directory IS the api slot (entry `src/index.ts`
 * slot-relative). Read from the nearest bos.config.json: its
 * `app.api.development: "local:<path>"` must resolve to the cwd.
 */
function isDeclaredApiSlot(cwd: string): boolean {
  const configPath = findBosConfigPath(cwd);
  if (!configPath) return false;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const development = config?.app?.api?.development;
    if (typeof development !== "string" || !development.startsWith("local:")) return false;
    const localPath = development.slice("local:".length);
    return path.resolve(path.dirname(configPath), localPath) === path.resolve(cwd);
  } catch {
    return false;
  }
}

export function resolvePluginEntry(cwd: string): string | null {
  if (fs.existsSync(path.join(cwd, "api", "src", "index.ts"))) return PLUGIN_ENTRY;
  if (fs.existsSync(path.join(cwd, SLOT_ENTRY))) {
    if (isDeclaredApiSlot(cwd)) return SLOT_ENTRY;
    throw new Error(migrationHint(path.basename(cwd), LEGACY_ENTRY, PLUGIN_ENTRY));
  }
  return null;
}

export function resolvePluginContract(cwd: string): string | null {
  if (fs.existsSync(path.join(cwd, "api", "src", "contract.ts"))) return PLUGIN_CONTRACT;
  if (fs.existsSync(path.join(cwd, SLOT_CONTRACT))) {
    if (isDeclaredApiSlot(cwd)) return SLOT_CONTRACT;
    throw new Error(migrationHint(path.basename(cwd), LEGACY_CONTRACT, PLUGIN_CONTRACT));
  }
  return null;
}

export function resolveDevConfigPath(cwd: string): string | null {
  if (fs.existsSync(path.join(cwd, BOS_DEV_CONFIG))) return path.join(cwd, BOS_DEV_CONFIG);
  if (fs.existsSync(path.join(cwd, LEGACY_DEV_CONFIG))) {
    throw new Error(
      `[every-plugin] ${path.basename(cwd)} uses the removed ${LEGACY_DEV_CONFIG} — ` +
        `rename it to ${BOS_DEV_CONFIG}`,
    );
  }
  return null;
}
