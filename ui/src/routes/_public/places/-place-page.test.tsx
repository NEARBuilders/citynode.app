// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { render } from "@/i18n/test-render";
import { createApiClient } from "@/lib/api";
import { createAuthClient } from "@/lib/auth";
import { Route } from "./$slug";

const nigeria = {
  id: "00000000-0000-4000-8000-000000000010",
  slug: "nigeria",
  name: "Nigeria",
  parentId: null,
  latitude: 9.08,
  longitude: 8.67,
  label: "country",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockApi(community: { nodeId: string } | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const requestBody =
        init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      const body = JSON.parse(
        typeof requestBody === "string" ? requestBody : (url.searchParams.get("data") ?? "{}"),
      );
      const args = body.json ?? {};
      const method = url.pathname.split("/").at(-1);
      switch (method) {
        case "resolvePlace":
          if (args.place !== "nigeria") return Response.json({ json: null });
          return Response.json({
            json: { place: nigeria, aliases: ["NG"], community },
          });
        case "getPlaceBoundary":
          return Response.json({ json: null });
        default:
          throw new Error(`Unexpected API call: ${method}`);
      }
    }),
  );
}

async function showPlace(slug: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  const context = {
    apiClient: createApiClient({ hostUrl: "http://localhost", rpcBase: "/api/rpc" }, new Headers()),
    queryClient,
    runtimeConfig: {
      env: "development",
      account: "base.near",
      networkId: "mainnet",
      assetsUrl: "http://localhost/assets",
      apiBase: "/api",
      rpcBase: "/api/rpc",
      hostUrl: "http://localhost",
      runtime: {
        accountId: "base.near",
        gatewayId: "citynode.app",
        runtimeBasePath: "/",
        title: "City Nodes",
        description: "",
        hostUrl: "http://localhost",
      },
    },
    authClient: createAuthClient({
      runtimeConfig: {
        hostUrl: "http://localhost",
        auth: {
          name: "auth",
          url: "http://localhost",
          entry: "remoteEntry.js",
          variables: { siwn: { recipient: "citynode.app" } },
        },
      },
    }),
  };
  const root = createRootRouteWithContext<typeof context>()({ component: Outlet });
  const routeOptions = {
    ...Route.options,
    getParentRoute: () => root,
    path: "/places/$slug",
    id: undefined,
  };
  const route = Route.update(routeOptions);
  const communityRoute = createRoute({
    getParentRoute: () => root,
    path: "/n/$slug",
    component: () => <p data-testid="community-redirect">community</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([route, communityRoute]),
    history: createMemoryHistory({ initialEntries: [`/places/${slug}`] }),
    context,
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return router;
}

it("shows an unactivated place with a start-community action", async () => {
  mockApi(null);
  await showPlace("nigeria");
  expect((await screen.findByTestId("place-page.header")).textContent).toContain("Nigeria");
  expect(screen.getByText("No community yet.")).toBeTruthy();
  expect(screen.getByTestId("place-page.start-community").getAttribute("href")).toBe(
    "/join?place=nigeria",
  );
});

it("sends an activated place to its community page", async () => {
  mockApi({ nodeId: "00000000-0000-4000-8000-000000000011" });
  const router = await showPlace("nigeria");
  await screen.findByTestId("community-redirect");
  expect(router.state.location.pathname).toBe("/n/nigeria");
});
