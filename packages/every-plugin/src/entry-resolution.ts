import fs from "node:fs";
import path from "node:path";

export const PLUGIN_ENTRY = "api/src/index.ts";
export const PLUGIN_CONTRACT = "api/src/contract.ts";
export const BOS_DEV_CONFIG = "bos.dev.ts";
const LEGACY_ENTRY = "src/index.ts";
const LEGACY_CONTRACT = "src/contract.ts";
const LEGACY_DEV_CONFIG = "plugin.dev.ts";

const migrationHint = (workspace: string, from: string, to: string) =>
  `[every-plugin] ${workspace} uses the removed ${from} layout — v2 requires ${to}. ` +
  `Migrate: mkdir api && git mv src api/src (and rename ${LEGACY_DEV_CONFIG} to ${BOS_DEV_CONFIG} if present)`;

export function resolvePluginEntry(cwd: string): string | null {
  if (fs.existsSync(path.join(cwd, "api", "src", "index.ts"))) return PLUGIN_ENTRY;
  if (fs.existsSync(path.join(cwd, LEGACY_ENTRY))) {
    throw new Error(migrationHint(path.basename(cwd), LEGACY_ENTRY, PLUGIN_ENTRY));
  }
  return null;
}

export function resolvePluginContract(cwd: string): string | null {
  if (fs.existsSync(path.join(cwd, "api", "src", "contract.ts"))) return PLUGIN_CONTRACT;
  if (fs.existsSync(path.join(cwd, LEGACY_CONTRACT))) {
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
