/**
 * Client bootstrap — creates browser-side QueryClient, Router, and auth/API clients.
 * Called from the host-rendered HTML shell.
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import { createApiClient, createAuthClient, getCspNonce, getRuntimeConfig } from "./app";
import "./styles.css";

interface NavManifestLike {
  items: Array<{
    id: string;
    label: string;
    icon?: string;
    group?: string;
    order?: number;
    to: string;
    plugin: string;
    mount: string;
  }>;
}

declare global {
  interface Window {
    __EVERYTHING_DEV_HYDRATE_PROMISE__?: Promise<void>;
    __EVERYTHING_DEV_SSR__?: boolean;
  }
}

/** Browser-safe MF shared shape — negotiated against the "default" scope
 * the core remote's remoteEntry already joined. */
const composeSharedDeps = {
  react: {
    shareConfig: {
      requiredVersion: false,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
  },
  "react-dom": {
    shareConfig: {
      requiredVersion: false,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
  },
  "@tanstack/react-router": {
    shareConfig: {
      requiredVersion: false,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
  },
  "@tanstack/react-query": {
    shareConfig: {
      requiredVersion: false,
      singleton: true,
      strictVersion: false,
      eager: false,
    },
  },
} as const satisfies Record<string, unknown>;

function configuredUiRemotes(runtimeConfig: ReturnType<typeof getRuntimeConfig>): Array<{
  id: string;
  name: string;
  url: string;
}> {
  return Object.entries(runtimeConfig.plugins ?? {}).flatMap(([id, plugin]) => {
    const ui = (plugin as { ui?: { url?: string; name?: string; integrity?: string } } | undefined)
      ?.ui;
    if (!ui?.url) return [];
    return [{ id, name: ui.name ?? `${id}-ui`, url: ui.url }];
  });
}

/**
 * Graftable client composition: load every configured plugin ui `./tree`
 * expose and graft onto the core tree before hydration. Only runs when the
 * server set `ui.compose` (flag-parity with SSR composition); any load
 * failure falls back to the core-only tree so hydration never regresses.
 */
async function composeClientPluginTrees(
  runtimeConfig: ReturnType<typeof getRuntimeConfig>,
  coreTree: unknown,
): Promise<{ routeTree: unknown; nav: NavManifestLike } | undefined> {
  if (!runtimeConfig.ui?.compose) return undefined;
  const remotes = configuredUiRemotes(runtimeConfig);
  if (remotes.length === 0) return undefined;

  try {
    const [{ createInstance }, { composeApp }] = await Promise.all([
      import("@module-federation/runtime"),
      import("everything-dev/ui/compose"),
    ]);
    const mf = createInstance({
      name: "hydrate-compose",
      remotes: remotes.map((remote) => ({
        name: remote.name,
        alias: remote.name,
        entry: `${remote.url.replace(/\/$/, "")}/remoteEntry.js`,
      })),
      shared: composeSharedDeps,
    });

    const loaded = await Promise.allSettled(
      remotes.map((remote) => mf.loadRemote(`${remote.name}/tree`, { from: "build" })),
    );
    const trees = loaded.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    if (trees.length === 0) return undefined;
    const failed = remotes.length - trees.length;
    if (failed > 0) {
      console.warn(`[Hydrate] ${failed} plugin ui tree(s) failed to load; core-only fallback`);
    }

    const result = composeApp(
      coreTree as never,
      remotes.map((remote, index) => ({
        name: remote.name,
        tree: (trees[index] as { default?: unknown })?.default as never,
      })),
    );
    console.log("[Hydrate] Composed plugin trees:", {
      mounts: result.mountCounts,
      warnings: result.warnings,
    });
    return { routeTree: result.routeTree, nav: result.nav };
  } catch (error) {
    console.error("[Hydrate] Client compose failed; core-only fallback:", error);
    return undefined;
  }
}

function isServerRendered(): boolean {
  if (document.documentElement.hasAttribute("data-everything-ssr")) {
    return true;
  }
  if (window.__EVERYTHING_DEV_SSR__ !== undefined) {
    return window.__EVERYTHING_DEV_SSR__;
  }
  return (window as any).$_TSR !== undefined;
}

export async function hydrate() {
  if (window.__EVERYTHING_DEV_HYDRATE_PROMISE__) {
    return window.__EVERYTHING_DEV_HYDRATE_PROMISE__;
  }

  const hydratePromise = (async () => {
    console.log("[Hydrate] Starting...");

    const runtimeConfig = getRuntimeConfig();
    const cspNonce = getCspNonce();

    if (!runtimeConfig.hostUrl || !runtimeConfig.rpcBase) {
      throw new Error("Missing hostUrl or rpcBase in runtime config");
    }

    const [{ QueryClient, QueryClientProvider }, { createRouter, routeTree }] = await Promise.all([
      import("@tanstack/react-query"),
      import("./router"),
    ]);
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });

    const composed = await composeClientPluginTrees(runtimeConfig, routeTree);

    const { router } = createRouter({
      routeTree: composed?.routeTree,
      context: {
        pluginNav: composed?.nav,
        queryClient: client,
        runtimeConfig,
        cspNonce,
        apiClient: createApiClient({
          hostUrl: runtimeConfig.hostUrl,
          rpcBase: runtimeConfig.rpcBase,
        }),
        authClient: createAuthClient({ runtimeConfig, cspNonce }),
      },
    });

    if (isServerRendered()) {
      const { hydrateRoot } = await import("react-dom/client");
      const { RouterClient } = await import("@tanstack/react-router/ssr/client");

      console.log("[Hydrate] Calling hydrateRoot...");
      hydrateRoot(
        document,
        <QueryClientProvider client={client}>
          <RouterClient router={router} />
        </QueryClientProvider>,
      );
    } else {
      const { createRoot } = await import("react-dom/client");
      const { RouterProvider } = await import("@tanstack/react-router");

      console.log("[Hydrate] Calling createRoot...");
      createRoot(document).render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
    }

    console.log("[Hydrate] Complete!");
  })().catch((error) => {
    console.error("[Hydrate] Failed:", error);
    window.__EVERYTHING_DEV_HYDRATE_PROMISE__ = undefined;
    throw error;
  });

  window.__EVERYTHING_DEV_HYDRATE_PROMISE__ = hydratePromise;
  return hydratePromise;
}

export default hydrate;
