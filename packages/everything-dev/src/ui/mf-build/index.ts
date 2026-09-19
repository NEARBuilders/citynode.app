/**
 * Shared build surface for ui plugins (dual MF targets).
 *
 * `createUiSharedDeps` resolves the canonical singleton shared list
 * (react, react-dom, @orpc/client, @orpc/contract, @tanstack/react-query,
 * @tanstack/react-router) with `requiredVersion` from the building
 * workspace's installed version so version mismatches fail the build —
 * the #106 guardrail extended to the react/TanStack/orpc set.
 *
 * `pluginUiDeployFields` / `CORE_UI_DEPLOY_FIELDS` name the bos.config.json
 * fields the Zephyr deploy hook writes back.
 *
 * A ui plugin's rsbuild.config.ts mirrors ui/rsbuild.config.ts with these
 * helpers: client target is an MF remote exposing `./tree` and (optionally)
 * `./components`; server target is a commonjs single-chunk build exposing
 * `./tree` with the `@module-federation/node` runtime plugin and
 * `autoCodeSplitting` off.
 */

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

export interface UiDeployFields {
  urlField: string;
  integrityField: string;
  ssrUrlField?: string;
  ssrIntegrityField?: string;
}

/** bos.config.json field paths a `plugins.<id>.ui` deploy writes back. */
export const pluginUiDeployFields = (pluginId: string): UiDeployFields => ({
  urlField: `plugins.${pluginId}.ui.production`,
  integrityField: `plugins.${pluginId}.ui.integrity`,
  ssrUrlField: `plugins.${pluginId}.ui.ssr`,
  ssrIntegrityField: `plugins.${pluginId}.ui.ssrIntegrity`,
});

/** Core shell field paths — unchanged from the v1 remote. */
export const CORE_UI_DEPLOY_FIELDS: UiDeployFields = {
  urlField: "app.ui.production",
  integrityField: "app.ui.integrity",
  ssrUrlField: "app.ui.ssr",
  ssrIntegrityField: "app.ui.ssrIntegrity",
};

/** Canonical exposes every graftable ui plugin ships. */
export const PLUGIN_UI_SHARED_EXPOSES = {
  tree: "./tree",
  components: "./components",
} as const;

export const UI_REMOTE_ENTRY_FILENAME = "remoteEntry.js";
export const UI_REMOTE_SERVER_ENTRY_FILENAME = "remoteEntry.server.js";

export function isUiServerBuild(): boolean {
  return process.env.BUILD_TARGET === "server";
}

const SHARE_MODULE_NAMES = [
  "react",
  "react-dom",
  "@orpc/client",
  "@orpc/contract",
  "@tanstack/react-query",
  "@tanstack/react-router",
] as const;

export interface UiSharedDepEntry {
  version: string;
  requiredVersion: string | false;
  singleton: true;
  strictVersion: boolean;
  eager: false;
  shareScope: "default";
}

function getInstalledVersion(pkgName: string, fallback?: string): string {
  try {
    let currentDir = path.dirname(require.resolve(pkgName));
    for (let i = 0; i < 5; i += 1) {
      const packageJsonPath = path.join(currentDir, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        return (JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { version: string })
          .version;
      }
      currentDir = path.dirname(currentDir);
    }
    throw new Error(`unresolved: ${pkgName}`);
  } catch {
    const match = fallback?.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
    return match?.[0] ?? "*";
  }
}

/**
 * Catalog-enforced singleton shared list for ui remotes. `requiredVersion`
 * resolves from the installed package (not the declared range), so a shared
 * version mismatch fails at build time instead of loading a second React.
 */
export function createUiSharedDeps(
  pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
  options?: { strictVersion?: boolean },
): Record<string, UiSharedDepEntry> {
  const fallbacks = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const deps: Record<string, UiSharedDepEntry> = {};
  for (const name of SHARE_MODULE_NAMES) {
    const version = getInstalledVersion(name, fallbacks[name]);
    deps[name] = {
      version,
      requiredVersion: options?.strictVersion === false ? false : version,
      singleton: true,
      strictVersion: options?.strictVersion !== false,
      eager: false,
      shareScope: "default",
    };
  }
  return deps;
}
