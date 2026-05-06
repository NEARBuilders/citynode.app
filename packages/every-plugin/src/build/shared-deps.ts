import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let pkg: typeof import("../../package.json");

try {
  pkg = JSON.parse(readFileSync(join(__dirname, "../../package.json"), "utf-8"));
} catch {
  pkg = require("every-plugin/package.json");
}

export interface SharedDependencyConfig {
  version: string;
  requiredVersion: string | false;
  singleton: boolean;
  strictVersion: boolean;
  eager: boolean;
}

export type SharedDependencies = Record<string, SharedDependencyConfig>;

const DEFAULT_SHARE_CONFIG: Omit<SharedDependencyConfig, "version"> = {
  requiredVersion: false,
  singleton: true,
  strictVersion: false,
  eager: false,
};

function extractExactVersion(input: string): string {
  const match = input.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  return match ? match[0] : input.replace(/^[\^~>=<\s]+/, "");
}

function getInstalledPackageVersion(packageName: string, fallbackVersion: string): string {
  try {
    return require(`${packageName}/package.json`).version as string;
  } catch {
    return extractExactVersion(fallbackVersion);
  }
}

export const pluginSharedDependencies = {
  "every-plugin": { version: pkg.version, ...DEFAULT_SHARE_CONFIG },
  effect: {
    version: getInstalledPackageVersion("effect", pkg.peerDependencies.effect),
    ...DEFAULT_SHARE_CONFIG,
  },
  zod: {
    version: getInstalledPackageVersion("zod", pkg.peerDependencies.zod),
    ...DEFAULT_SHARE_CONFIG,
  },
  "better-auth": {
    version: getInstalledPackageVersion("better-auth", "^1.6.9"),
    ...DEFAULT_SHARE_CONFIG,
  },
  "drizzle-orm": {
    version: getInstalledPackageVersion("drizzle-orm", "^0.45.1"),
    ...DEFAULT_SHARE_CONFIG,
  },
  "@orpc/contract": {
    version: getInstalledPackageVersion("@orpc/contract", pkg.peerDependencies["@orpc/contract"]),
    ...DEFAULT_SHARE_CONFIG,
  },
  "@orpc/server": {
    version: getInstalledPackageVersion("@orpc/server", pkg.peerDependencies["@orpc/server"]),
    ...DEFAULT_SHARE_CONFIG,
  },
} satisfies SharedDependencies;

export type PluginSharedDependencyName = keyof typeof pluginSharedDependencies;

export function getPluginSharedDependencies(): SharedDependencies {
  return pluginSharedDependencies;
}

export function getPluginSharedDependenciesVersionRange(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(getPluginSharedDependencies()).map(([name, config]) => [
      name,
      getMajorMinorVersion(config.version),
    ]),
  );
}

export function getMajorMinorVersion(version: string): string {
  const clean = version.replace(/^[\^~>=<]+/, "");
  const match = clean.match(/^(\d+)\.(\d+)/);
  if (!match) return "^0.0.0";
  return `^${match[1]}.${match[2]}.0`;
}
