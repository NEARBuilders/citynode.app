/**
 * Digest-keyed composed route tree for plugin ui grafting (SSR).
 *
 * Plugin trees load once (federation.server cache, keyed per remote), the
 * composed tree caches by the config digest — the resolved core ui remote
 * plus every plugin ui remote's urls + integrity hashes. Per-request work is
 * only createRouter + render inside the ui module; composition runs on
 * digest changes only (publish → new integrity → recompose).
 */

import type { AnyRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import {
  ComposeCache,
  composeApp,
  computeComposeDigest,
  type NavManifest,
} from "everything-dev/ui/compose";
import type { RuntimeConfig } from "./config";
import { loadPluginUiTree, type PluginUiSsrEntry } from "./federation.server";

const COMPOSE_CACHE_TTL_MS = 2 * 60_000;
const COMPOSE_CACHE_MAX_ENTRIES = 32;

export interface ComposedUi {
  routeTree: AnyRoute;
  digest: string;
  nav: NavManifest;
  mounts: Record<string, number>;
  warnings: string[];
}

/** The client compose switch: a plugin ui remote must exist and the server
 * must also run composition so server + client trees stay identical. */
export function hasComposablePluginUi(config: RuntimeConfig): boolean {
  return pluginsWithUi(config).length > 0 && process.env.BOS_UI_COMPOSE === "1";
}

export function pluginsWithUi(config: RuntimeConfig): Array<{
  id: string;
  entry: PluginUiSsrEntry;
}> {
  return Object.entries(config.plugins ?? {})
    .filter(([, p]) => Boolean(p.ui?.ssrUrl))
    .map(([id, p]) => ({
      id,
      entry: { name: p.ui!.name, ssrUrl: p.ui!.ssrUrl, ssrIntegrity: p.ui!.ssrIntegrity },
    }));
}

import { MOUNT_REGISTRY_VERSION } from "everything-dev/ui/compose";

export function uiComposeDigest(config: RuntimeConfig): string {
  const remotes = [
    {
      id: "core",
      ui: { url: config.ui.url, integrity: config.ui.integrity },
      compose: pluginsWithUi(config).length > 0,
    },
    ...Object.entries(config.plugins ?? {}).map(([id, p]) => ({
      id,
      ui: p.ui ? { url: p.ui.url, integrity: p.ui.integrity } : undefined,
      compose: Boolean(p.ui?.ssrUrl),
    })),
  ];
  return computeComposeDigest(remotes, MOUNT_REGISTRY_VERSION);
}

const composeCache = new ComposeCache<ComposedUi>(COMPOSE_CACHE_TTL_MS, COMPOSE_CACHE_MAX_ENTRIES);

export function resetUiComposeCache() {
  composeCache.clear();
}

export interface ComposedPluginTrees {
  composed: ComposedUi | null;
  warnings: string[];
}

/**
 * Compose plugin ui trees into the core route tree, digest-cached.
 * Without plugin ui entries the core tree composes to itself and the nav
 * manifest stays empty — zero behavioral delta for monolith-only runtimes.
 * Tree load failures throw; callers fall back to the CSR shell.
 */
export const composePluginTrees = (inputs: {
  coreTree: AnyRoute;
  config: RuntimeConfig;
}): Effect.Effect<ComposedPluginTrees, Error, never> =>
  Effect.gen(function* () {
    const { coreTree, config } = inputs;
    const digest = uiComposeDigest(config);
    const pluginEntries = pluginsWithUi(config);

    if (pluginEntries.length === 0) {
      const composed: ComposedUi = {
        routeTree: coreTree,
        digest,
        nav: { items: [] },
        mounts: {},
        warnings: [],
      };
      composeCache.set(digest, composed);
      return { composed, warnings: [] } satisfies ComposedPluginTrees;
    }

    const cached = composeCache.get(digest);
    if (cached && cached.routeTree === coreTree) {
      return { composed: cached, warnings: [] } satisfies ComposedPluginTrees;
    }

    const trees = yield* Effect.forEach(pluginEntries, (entry) => loadPluginUiTree(entry.entry), {
      concurrency: "unbounded",
    });

    const { routeTree, mountCounts, nav, warnings } = composeApp(
      coreTree,
      pluginEntries.map((entry, index) => ({
        name: entry.entry.name,
        tree: trees[index] as AnyRoute,
      })),
    );
    const result: ComposedUi = { routeTree, digest, mounts: mountCounts, nav, warnings };

    composeCache.set(digest, result);
    return { composed: result, warnings: result.warnings } satisfies ComposedPluginTrees;
  });
