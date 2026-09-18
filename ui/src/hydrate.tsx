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

function configuredUiPluginIds(runtimeConfig: ReturnType<typeof getRuntimeConfig>): string[] {
  return Object.entries(runtimeConfig.plugins ?? {}).map(([id]) => id);
}

function pluginUi(
  pluginId: string,
  runtimeConfig: ReturnType<typeof getRuntimeConfig>["plugins"],
): { url: string; integrity?: string; name: string; ssrUrl?: string } | undefined {
  const ui = (
    runtimeConfig?.[pluginId] as
      | { ui?: { url?: string; name?: string; integrity?: string; ssrUrl?: string } }
      | undefined
  )?.ui;
  if (!ui?.url) return undefined;
  return {
    url: ui.url,
    integrity: ui.integrity,
    name: ui.name ?? `${pluginId}-ui`,
    ssrUrl: ui.ssrUrl,
  };
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
  const remotes = configuredUiPluginIds(runtimeConfig).flatMap((id) => {
    const ui = pluginUi(id, runtimeConfig.plugins);
    return ui ? [{ id, name: ui.name, url: ui.url, integrity: ui.integrity }] : [];
  });
  if (remotes.length === 0) return undefined;

  try {
    const [
      { registerRemotes, loadRemote },
      { composeApp, computeComposeDigest, MOUNT_REGISTRY_VERSION },
    ] = await Promise.all([
      import("@module-federation/runtime"),
      import("everything-dev/ui/compose"),
    ]);
    registerRemotes(
      remotes.map((remote) => ({
        name: remote.name,
        alias: remote.name,
        entry: `${remote.url.replace(/\/$/, "")}/remoteEntry.js`,
      })),
    );

    const loaded = await Promise.allSettled(
      remotes.map(async (remote) => {
        const mod = (await loadRemote(`${remote.name}/tree`, { from: "build" })) as {
          default?: unknown;
        };
        return { name: remote.name, tree: mod.default };
      }),
    );
    const modules = loaded.flatMap((result) =>
      result.status === "fulfilled" && result.value.tree ? [result.value] : [],
    );
    if (modules.length === 0) return undefined;
    if (modules.length < remotes.length) {
      console.warn(
        `[Hydrate] ${remotes.length - modules.length} plugin ui tree(s) failed to load; core-only fallback`,
      );
    }

    // Assert tree identity: the client's fingerprint over the remotes it can
    // see must match the digest the server computed for the tree that was
    // SSR'd. On mismatch the composed server HTML cannot hydrate safely, so
    // fall back to the core-only tree.
    const clientDigest = computeComposeDigest(
      [
        {
          id: "core",
          ui: {
            url: runtimeConfig.ui?.url,
            integrity: runtimeConfig.ui?.integrity,
          },
          compose: true,
        },
        ...remotes.map((remote) => ({
          id: remote.id,
          ui: { url: remote.url, integrity: remote.integrity },
          compose: true,
        })),
      ],
      MOUNT_REGISTRY_VERSION,
    );
    const expectedDigest = runtimeConfig.ui?.composeDigest;
    if (expectedDigest && expectedDigest !== clientDigest) {
      console.warn(
        `[Hydrate] Compose digest mismatch (client ${clientDigest} vs server ${expectedDigest}); core-only fallback`,
      );
      return undefined;
    }

    const result = composeApp(
      coreTree as never,
      modules.map((mod) => ({ name: mod.name, tree: mod.tree as never })),
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
