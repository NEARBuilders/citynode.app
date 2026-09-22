/**
 * Client bootstrap — creates browser-side QueryClient, Router, and auth/API
 * clients; composes the route tree from the runtime-config payload before
 * hydration (payload -> registerRemotes -> loadRemote route configs ->
 * constructTree -> hydrateRoot(RouterClient)). Called from the host-rendered
 * HTML shell. The build's MF runtime owns the page's share scope — the global
 * registerRemotes/loadRemote API bridges it (one React/router across the core
 * client and plugin containers by share-scope negotiation).
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import { createApiClient, createAuthClient, getCspNonce, getRuntimeConfig } from "./app";
import {
  CORE_UI_PLUGIN_KEY,
  ComposePayloadSchema,
  type NavManifest,
  type RouteConfigModule,
} from "./compose";
import "./styles.css";

declare global {
  interface Window {
    __EVERYTHING_DEV_HYDRATE_PROMISE__?: Promise<void>;
    __EVERYTHING_DEV_SSR__?: boolean;
    __CLIENT_PROGRESS__?: string[];
    $_TSR?: unknown;
  }
}

const mark = (message: string) => {
  const progress = window.__CLIENT_PROGRESS__ ?? [];
  window.__CLIENT_PROGRESS__ = [...progress, message];
  if (import.meta.env.DEV) console.log(`[Hydrate] ${message}`);
};

/**
 * Manifest composition: reconstruct the server's tree from the payload — the
 * same manifests, the same MF names, the same construction code. Digest
 * parity proves the SSR'd tree and this tree are identical before hydrate;
 * any failure falls back to the core-only tree so hydration never regresses.
 */
async function composeFromPayload(
  runtimeConfig: ReturnType<typeof getRuntimeConfig>,
  coreRouteConfig: RouteConfigModule,
): Promise<{ routeTree: unknown; nav: NavManifest } | undefined> {
  const payload = runtimeConfig.ui?.compose;
  if (!payload?.remotes) return undefined;

  try {
    const [{ registerRemotes, loadRemote }, { constructTree }] = await Promise.all([
      import("@module-federation/enhanced/runtime"),
      import("./compose"),
    ]);

    mark(`compose payload: digest ${payload.digest}, ${payload.remotes.length} remote(s)`);

    const { manifests } = ComposePayloadSchema.parse(payload);
    const manifestByKey = new Map(manifests.map((m) => [m.name, m]));
    const coreUiName = runtimeConfig.ui?.name ?? CORE_UI_PLUGIN_KEY;

    registerRemotes(
      payload.remotes.map((remote) => ({
        name: remote.name,
        alias: remote.name,
        // Manifest-driven registration: the manifest carries the remote's
        // true container identity (its build-time package name), which the
        // plain remoteEntry URL cannot resolve — the entry script's global
        // name doesn't match the registered name.
        entry: remote.entry.replace(/\/?remoteEntry\.js$/, "/mf-manifest.json"),
      })),
    );
    for (const remote of payload.remotes) {
      mark(`remote registered ${remote.name} @ ${remote.entry}`);
    }

    const tree = await constructTree({
      name: "client",
      plugins: manifests.map((manifest) => {
        const remote = payload.remotes.find((r) => r.key === manifest.name);
        return {
          key: manifest.name,
          mfName:
            remote?.name ?? (manifest.name === CORE_UI_PLUGIN_KEY ? coreUiName : manifest.name),
        };
      }),
      resolve: async (ref) => {
        const manifest = manifestByKey.get(ref.key);
        if (!manifest) throw new Error(`compose payload has no manifest for "${ref.key}"`);
        if (ref.key === CORE_UI_PLUGIN_KEY) {
          return { key: ref.key, manifest, routeConfig: coreRouteConfig };
        }
        const remote = payload.remotes.find((r) => r.key === ref.key);
        if (!remote) throw new Error(`compose payload has no remote for "${ref.key}"`);
        const mod = await loadRemote(`${remote.name}/routeConfig`, { from: "build" });
        const routeConfig = ((mod as { default?: RouteConfigModule })?.default ??
          mod) as RouteConfigModule;
        if (!routeConfig?.routeConfigLoaders) {
          throw new Error(`loadRemote(${remote.name}/routeConfig) returned no route config`);
        }
        mark(`loaded ${remote.name}/routeConfig`);
        return { key: ref.key, manifest, routeConfig };
      },
      rootOptions: coreRouteConfig.rootMeta,
    });

    if (tree.digest !== payload.digest) {
      console.warn(
        `[Hydrate] Compose digest mismatch (client ${tree.digest} vs server ${payload.digest}); core-only fallback`,
      );
      mark(`DIGEST PARITY FAILURE server=${payload.digest} client=${tree.digest}`);
      return undefined;
    }

    mark(
      `tree constructed: ${tree.manifests.length} source(s), ${tree.nav.items.length} nav item(s)`,
    );
    return { routeTree: tree.rootRoute, nav: tree.nav };
  } catch (error) {
    console.error("[Hydrate] Client compose failed; core-only fallback:", error);
    mark(`CLIENT COMPOSE ERROR: ${(error as Error).message}`);
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
  return window.$_TSR !== undefined;
}

function watchHydrationConsumed() {
  const bootstrapWatch = setInterval(() => {
    if (window.$_TSR === undefined) {
      clearInterval(bootstrapWatch);
      mark("hydration consumed ($_TSR deleted — h() ran)");
    }
  }, 50);
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

    const [{ QueryClient, QueryClientProvider }, { createRouter }] = await Promise.all([
      import("@tanstack/react-query"),
      import("./router"),
    ]);
    const [coreRouteConfig] = await Promise.all([import("./routeConfig.gen")]);
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

    mark(`$_TSR present: ${Boolean(window.$_TSR)}`);

    const composed = await composeFromPayload(runtimeConfig, coreRouteConfig);

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

    // A server-rendered page whose compose fell back to core-only would
    // hydrate a DIFFERENT tree than the HTML contains — a guaranteed React
    // hydration failure. Client-render cleanly instead; hydration is only
    // safe when the composed tree is the one the server rendered.
    const canHydrate = isServerRendered() && Boolean(composed);

    if (canHydrate) {
      const { hydrateRoot } = await import("react-dom/client");
      const { RouterClient } = await import("@tanstack/react-router/ssr/client");

      console.log("[Hydrate] Calling hydrateRoot...");
      hydrateRoot(
        document,
        <QueryClientProvider client={client}>
          <RouterClient router={router} />
        </QueryClientProvider>,
      );
      watchHydrationConsumed();
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
