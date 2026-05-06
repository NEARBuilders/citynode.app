import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
declare const __EVERY_PLUGIN_VERSION__: string | undefined;

function readPackageVersion(): string {
  try {
    return (require("../../package.json") as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

function getInstalledPackageVersion(packageName: string, fallbackRange: string): string {
  try {
    return require(`${packageName}/package.json`).version as string;
  } catch {
    const match = fallbackRange.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
    return match ? match[0] : fallbackRange.replace(/^[\^~>=<\s]+/, "");
  }
}

export const PLUGIN_VERSION =
  typeof __EVERY_PLUGIN_VERSION__ === "string" ? __EVERY_PLUGIN_VERSION__ : readPackageVersion();

export const SHARE_CONFIG = {
  singleton: true,
  requiredVersion: false,
  strictVersion: false,
  eager: false,
} as const;

export const MF_SHARED_DEPS = {
  "every-plugin": {
    version: PLUGIN_VERSION,
    shareConfig: SHARE_CONFIG,
  },
  effect: {
    version: getInstalledPackageVersion("effect", "^3.21.0"),
    shareConfig: SHARE_CONFIG,
  },
  zod: {
    version: getInstalledPackageVersion("zod", "^4.3.6"),
    shareConfig: SHARE_CONFIG,
  },
  "better-auth": {
    version: getInstalledPackageVersion("better-auth", "^1.6.9"),
    shareConfig: SHARE_CONFIG,
  },
  "drizzle-orm": {
    version: getInstalledPackageVersion("drizzle-orm", "^0.45.1"),
    shareConfig: SHARE_CONFIG,
  },
  "@orpc/contract": {
    version: getInstalledPackageVersion("@orpc/contract", "^1.13.4"),
    shareConfig: SHARE_CONFIG,
  },
  "@orpc/server": {
    version: getInstalledPackageVersion("@orpc/server", "^1.13.4"),
    shareConfig: SHARE_CONFIG,
  },
} as const;

export type SharedDepName = keyof typeof MF_SHARED_DEPS;
