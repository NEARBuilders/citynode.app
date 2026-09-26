/**
 * Client router factory — creates a TanStack Router with browser history.
 * The app-specific route tree is injected as `defaultRouteTree` (the
 * bundled core-only fallback); the composed tree wins when manifest
 * construction produced one.
 */

import { dehydrate, hydrate } from "@tanstack/react-query";
import {
  type AnyRoute,
  createBrowserHistory,
  createRouter as createTanStackRouter,
} from "@tanstack/react-router";
import { createAuthClient } from "./auth";
import { RouterError } from "./router-error";
import type { CreateRouterOptions, RouterContextWithApi } from "./types";

function defaultNotFoundComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-foreground">Not Found</h1>
        <p className="mt-2 text-muted-foreground">The requested page could not be found.</p>
      </div>
    </div>
  );
}

function defaultPendingComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <p className="text-sm text-muted-foreground">Loading...</p>
    </div>
  );
}

export interface CoreRouterOptions<TApiClient = unknown, TSession = unknown>
  extends CreateRouterOptions<TApiClient, TSession> {
  /** The app's generated route tree — the core-only fallback when no composed tree is passed. */
  defaultRouteTree?: unknown;
}

export function createRouter<
  TApiClient = unknown,
  TSession = unknown,
  TRouteTree extends AnyRoute = AnyRoute,
>(
  opts: CoreRouterOptions<TApiClient, TSession> & {
    context: RouterContextWithApi<TApiClient, TSession> & { authClient?: unknown };
  },
) {
  const queryClient = opts.context.queryClient;
  const history = opts.history ?? createBrowserHistory();
  const cspNonce = opts.context.cspNonce;

  const router = createTanStackRouter({
    routeTree: (opts.routeTree ?? opts.defaultRouteTree) as TRouteTree,
    history,
    basepath: opts.basepath ?? opts.context.runtimeConfig?.runtime?.runtimeBasePath ?? "/",
    context: {
      queryClient,
      runtimeConfig: opts.context.runtimeConfig,
      cspNonce: opts.context.cspNonce,
      apiClient: opts.context.apiClient,
      authClient:
        opts.context.authClient ??
        createAuthClient({
          runtimeConfig: opts.context.runtimeConfig,
          cspNonce: opts.context.cspNonce,
        }),
      session: opts.context.session,
    },
    ...(cspNonce ? { ssr: { nonce: cspNonce } } : {}),
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
    defaultPendingMinMs: 0,
    defaultErrorComponent: RouterError,
    defaultNotFoundComponent,
    defaultPendingComponent,
    dehydrate: () => {
      if (typeof window === "undefined") {
        return { queryClientState: dehydrate(queryClient) };
      }

      return { queryClientState: {} };
    },
    hydrate: (dehydrated: { queryClientState?: unknown }) => {
      if (typeof window !== "undefined" && dehydrated?.queryClientState) {
        hydrate(queryClient, dehydrated.queryClientState);
      }
    },
  });

  return { router, queryClient };
}
