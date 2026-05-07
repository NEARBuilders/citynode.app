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

export const MF_CORE_SHARED_DEPS = {
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
  "@orpc/contract": {
    version: getInstalledPackageVersion("@orpc/contract", "^1.13.4"),
    shareConfig: SHARE_CONFIG,
  },
  "@orpc/server": {
    version: getInstalledPackageVersion("@orpc/server", "^1.13.4"),
    shareConfig: SHARE_CONFIG,
  },
} as const;

export type CoreSharedDepName = keyof typeof MF_CORE_SHARED_DEPS;

export interface AppSharedDepConfig {
  version: string;
  requiredVersion?: string | false;
  singleton?: boolean;
  strictVersion?: boolean;
  eager?: boolean;
  shareScope?: string;
}

export type AppSharedDeps = Record<string, AppSharedDepConfig>;

export function buildMergedSharedDeps(
  appShared?: AppSharedDeps,
): Record<string, { version: string; shareConfig: typeof SHARE_CONFIG }> {
  const merged: Record<string, { version: string; shareConfig: typeof SHARE_CONFIG }> = {};

  for (const [name, config] of Object.entries(MF_CORE_SHARED_DEPS)) {
    merged[name] = { version: config.version, shareConfig: config.shareConfig };
  }

  if (appShared) {
    for (const [name, config] of Object.entries(appShared)) {
      merged[name] = {
        version: config.version,
        shareConfig: {
          singleton: (config.singleton ?? true) as true,
          requiredVersion: (config.requiredVersion ?? false) as false,
          strictVersion: (config.strictVersion ?? false) as false,
          eager: (config.eager ?? false) as false,
        },
      };
    }
  }

  return merged;
}
