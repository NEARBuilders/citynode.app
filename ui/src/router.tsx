/**
 * Client router factory — creates a TanStack Router with browser history.
 *
 * BE CAREFUL MODIFYING THIS FILE — changes will be overwritten by `bos sync` / `bos upgrade`.
 * Prefer upstream changes at https://github.com/nearbuilders/everything-dev
 */

import { dehydrate, hydrate } from "@tanstack/react-query";
import { createBrowserHistory, createRouter as createTanStackRouter } from "@tanstack/react-router";
import type { CreateRouterOptions } from "./app";
import { createAuthClient } from "./app";
import { RouterError } from "./components/router-error";
import { routeTree } from "./routeTree.gen";

export type {
  ClientRuntimeConfig,
  CreateRouterOptions,
  RouterContext,
  RouterModule,
} from "./app";

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

export function createRouter(opts: CreateRouterOptions) {
  const queryClient = opts.context.queryClient;
  const history = opts.history ?? createBrowserHistory();
  const cspNonce = opts.context.cspNonce;

  const router = createTanStackRouter({
    routeTree,
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

export { routeTree };

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>["router"];
  }
}
