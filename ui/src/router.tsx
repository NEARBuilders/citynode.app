/**
 * Client router — the authored router seam. Injects the app's generated
 * route tree into the framework router factory, keeping full route-type
 * inference for the app. App-owned: customize router policy, query timings,
 * and error/pending/not-found components here.
 */

import { createRouter as createCoreRouter } from "everything-dev/ui/router-client";
import { defaultQueryClient } from "everything-dev/ui/router-defaults";
import type { ApiClient, CreateRouterOptions, SessionData } from "./app";
import { RootNotFound } from "./components/root-not-found";
import { RouterError, RouterPending } from "./components/router-error";
import { routeTree } from "./routeTree.gen";

export type {
  ClientRuntimeConfig,
  CreateRouterOptions,
  RouterContext,
  RouterModule,
} from "./app";

export function createQueryClient() {
  return defaultQueryClient();
}

export function createRouter(opts: CreateRouterOptions) {
  const { router, queryClient } = createCoreRouter<ApiClient, SessionData, typeof routeTree>({
    ...opts,
    defaultRouteTree: routeTree,
  });
  router.update({
    context: router.options.context,
    defaultErrorComponent: RouterError,
    defaultPendingComponent: RouterPending,
    defaultNotFoundComponent: RootNotFound,
  });
  return { router, queryClient };
}

export { routeTree };

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>["router"];
  }
}
