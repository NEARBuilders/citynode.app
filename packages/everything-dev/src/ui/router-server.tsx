/**
 * SSR router factory — creates request-scoped server routers and server-side
 * API/auth clients per request. Mirrors the client router shape for
 * hydration consistency. The app injects its generated route tree and (for
 * a byte-identical child surface) its error component.
 */

import { dehydrate, hydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  type AnyRoute,
  type AnyRouter,
  createMemoryHistory,
  createRouter as createTanStackRouter,
} from "@tanstack/react-router";
import {
  createRequestHandler,
  RouterServer,
  renderRouterToStream,
} from "@tanstack/react-router/ssr/server";
import type { ReactNode } from "react";
import { createApiClient } from "./api";
import { createAuthClient } from "./auth";
import { collectHeadData } from "./router";
import { RouterError } from "./router-error";
import type {
  CreateRouterOptions,
  HeadData,
  RenderOptionsWithApi,
  RenderResult,
  RouterContextWithApi,
  RouterModule,
} from "./types";

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

export interface ServerRouterModuleOptions {
  /** The app's generated route tree — the core-only fallback when no composed tree is passed. */
  defaultRouteTree?: unknown;
  /** Route error boundary; defaults to the generic framework component. */
  errorComponent?: (props: { error: Error }) => ReactNode;
}

type ServerRouterOptions = CreateRouterOptions & {
  context?: Partial<RouterContextWithApi> & { pluginNav?: unknown };
};

export function createServerRouterModule(
  options: ServerRouterModuleOptions = {},
): RouterModule<unknown, unknown> {
  const defaultRouteTree = options.defaultRouteTree;
  const errorComponent = options.errorComponent ?? RouterError;

  const createRouter = (
    opts?: ServerRouterOptions,
  ): { router: AnyRouter; queryClient: QueryClient } => {
    const context = opts?.context;
    const queryClient =
      context?.queryClient ??
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      });

    const history = opts?.history ?? createMemoryHistory();

    const cspNonce = context?.cspNonce;
    // RouterCore's `in out` type parameters reject the framework's loose
    // AnyRouter contract when the tree is typed as the wide AnyRoute — the
    // runtime instance genuinely satisfies it, so the boundary casts once.
    const router = createTanStackRouter({
      routeTree: (opts?.routeTree ?? defaultRouteTree) as AnyRoute,
      history,
      basepath: opts?.basepath,
      context: {
        queryClient,
        runtimeConfig: context?.runtimeConfig,
        apiClient: context?.apiClient,
        authClient:
          context?.authClient ??
          createAuthClient({
            runtimeConfig: context?.runtimeConfig,
            cspNonce: context?.cspNonce,
          }),
        session: context?.session,
        cspNonce,
        pluginNav: context?.pluginNav,
      },
      ...(cspNonce ? { ssr: { nonce: cspNonce } } : {}),
      defaultPreload: "intent",
      scrollRestoration: true,
      defaultStructuralSharing: true,
      defaultPreloadStaleTime: 0,
      defaultErrorComponent: errorComponent,
      defaultOnCatch: (error, errorInfo) => {
        console.error("[SSR] Router error boundary caught:", error, {
          componentStack: errorInfo.componentStack,
        });
      },
      defaultNotFoundComponent,
      defaultPendingComponent,
      defaultPendingMinMs: 0,
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
    }) as unknown as AnyRouter;

    return { router, queryClient };
  };

  const getRouteHead = async (
    pathname: string,
    context?: Partial<RouterContextWithApi> & { routeTree?: unknown },
  ): Promise<HeadData> => {
    const history = createMemoryHistory({ initialEntries: [pathname] });
    const queryClient = new QueryClient();
    const runtimeConfig = context?.runtimeConfig;
    if (!runtimeConfig?.hostUrl || !runtimeConfig.rpcBase) {
      throw new Error("Missing runtime config for route head generation");
    }

    const router = createTanStackRouter({
      routeTree: (context?.routeTree ?? defaultRouteTree) as AnyRoute,
      history,
      context: {
        queryClient,
        runtimeConfig,
        apiClient:
          context?.apiClient ??
          createApiClient({ hostUrl: runtimeConfig.hostUrl, rpcBase: runtimeConfig.rpcBase }),
        authClient:
          context?.authClient ?? createAuthClient({ runtimeConfig, cspNonce: context?.cspNonce }),
        session: context?.session,
      },
    });

    return collectHeadData(router);
  };

  const renderToStream = async (
    request: Request,
    renderOptions: RenderOptionsWithApi,
  ): Promise<RenderResult> => {
    const url = new URL(request.url);
    const history = createMemoryHistory({ initialEntries: [url.pathname + url.search] });
    let queryClientRef: QueryClient | null = null;

    const handler = createRequestHandler({
      request,
      createRouter: () => {
        const localQueryClient =
          queryClientRef ??
          new QueryClient({
            defaultOptions: {
              queries: {
                staleTime: 5 * 60 * 1000,
                gcTime: 30 * 60 * 1000,
                refetchOnWindowFocus: false,
                retry: 1,
              },
            },
          });
        const { router } = createRouter({
          history,
          routeTree: renderOptions.routeTree,
          basepath: renderOptions.basepath,
          context: {
            queryClient: localQueryClient,
            runtimeConfig: renderOptions.runtimeConfig,
            apiClient: renderOptions.apiClient,
            authClient: createAuthClient({
              runtimeConfig: renderOptions.runtimeConfig,
              headers: request.headers,
              cspNonce: renderOptions.cspNonce,
            }),
            session: renderOptions.session,
            cspNonce: renderOptions.cspNonce,
            pluginNav: renderOptions.pluginNav,
          },
        });
        queryClientRef = localQueryClient;
        return router;
      },
    });

    const response = await handler(({ request, responseHeaders, router }) =>
      renderRouterToStream({
        request,
        responseHeaders,
        router,
        children: (
          <QueryClientProvider client={queryClientRef!}>
            <RouterServer router={router} />
          </QueryClientProvider>
        ),
      }),
    );

    return {
      stream: response.body!,
      statusCode: response.status,
      headers: response.headers,
    } satisfies RenderResult;
  };

  return {
    createRouter,
    getRouteHead,
    renderToStream,
  };
}
