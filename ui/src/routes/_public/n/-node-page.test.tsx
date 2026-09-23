// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  redirect,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createApiClient } from "@/lib/api";
import { createAuthClient, type SessionData, sessionQueryOptions } from "@/lib/auth";
import { Route as StakeRoute } from "../../_authenticated/_dashboard/stake";
import { Route } from "./$slug";

const parent = {
  id: "00000000-0000-4000-8000-000000000001",
  parentId: null,
  tenantId: "tenant",
  slug: "illinois",
  name: "Illinois",
  kind: "state",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const child = {
  ...parent,
  id: "00000000-0000-4000-8000-000000000002",
  parentId: parent.id,
  slug: "chicago",
  name: "Chicago",
  kind: "city",
};
const validator = {
  id: "pool",
  nodeId: parent.id,
  accountId: "illinois.poolv1.near",
  protocol: "near",
  network: "mainnet",
  role: "official",
  isDefault: true,
  metadata: {},
  createdAt: parent.createdAt,
  updatedAt: parent.updatedAt,
};
const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.unstubAllGlobals();
});

function mockApi(nodes = [parent, child], ownPoolNodeId?: string) {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const requestBody =
        init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      const body = JSON.parse(String(requestBody || url.searchParams.get("data") || "{}"));
      if (url.pathname === "/api/auth/get-session") return Response.json(null);
      if (url.hostname === "rpc.mainnet.near.org") {
        const values: Record<string, unknown> = {
          get_total_staked_balance: "1000000000000000000000000",
          get_reward_fee_fraction: { numerator: 5, denominator: 100 },
          get_number_of_accounts: 1,
          get_accounts: [
            { account_id: "staker.near", staked_balance: "1000000000000000000000000" },
          ],
        };
        return Response.json({
          result: {
            result: [...new TextEncoder().encode(JSON.stringify(values[body.params.method_name]))],
          },
        });
      }
      const args = body.json ?? {};
      const method = url.pathname.split("/").at(-1);
      switch (method) {
        case "resolveNodeBySlug": {
          const node = nodes.find(
            (entry) =>
              entry.slug === args.slug &&
              (args.parentId === undefined || entry.parentId === args.parentId),
          );
          return Response.json({ json: node ?? null });
        }
        case "listChildren":
          return Response.json({ json: nodes.filter((entry) => entry.parentId === args.nodeId) });
        case "resolveStakingValidators": {
          const node = nodes.find((entry) => entry.id === args.nodeId);
          const sourceNodeId =
            node && node.id === ownPoolNodeId ? node.id : (node?.parentId ?? node?.id);
          return Response.json({
            json: { sourceNodeId, validators: [{ ...validator, nodeId: sourceNodeId }] },
          });
        }
        case "getNode":
          return Response.json({ json: nodes.find((entry) => entry.id === args.nodeId) ?? null });
        case "getSubtree":
          return Response.json({
            json: nodes
              .filter((entry) => entry.id === args.nodeId)
              .map((entry) => ({ ...entry, validators: [] })),
          });
        default:
          throw new Error(`Unexpected API call: ${method}`);
      }
    }),
  );
}

async function showNode(url: string, signedIn = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  if (signedIn)
    queryClient.setQueryData(["session"], {
      user: { id: "preview-user" },
      session: { id: "preview-session" },
    });
  const context = {
    apiClient: createApiClient({ hostUrl: "http://localhost", rpcBase: "/api/rpc" }, new Headers()),
    queryClient,
    runtimeConfig: undefined,
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
    path: "/n/$slug",
    id: undefined,
  };
  const stakeOptions = {
    ...StakeRoute.options,
    getParentRoute: () => root,
    path: "/stake",
    id: undefined,
  };
  const route = Route.update(routeOptions);
  const stakeRoute = StakeRoute.update(stakeOptions);
  const loginRoute = createRoute({
    getParentRoute: () => root,
    path: "/login",
    beforeLoad: ({ context: ctx, search }) => {
      const target = (search as { redirect?: string }).redirect ?? "/dashboard";
      const session = ctx.queryClient.getQueryData<SessionData>(
        sessionQueryOptions(ctx.authClient, undefined).queryKey,
      );
      if (session?.user) {
        throw redirect({ to: target });
      }
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([route, stakeRoute, loginRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
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

it("opens a child node directly and renders its inherited pool and live metrics", async () => {
  mockApi();
  await showNode("/n/chicago");
  expect(await screen.findByRole("heading", { name: "Chicago", level: 1 })).toBeTruthy();
  expect(await screen.findByText("Stake inherited from Illinois.")).toBeTruthy();
  expect(await screen.findAllByText("1 NEAR")).toHaveLength(2);
  expect(screen.getByRole("heading", { name: "illinois.poolv1.near" })).toBeTruthy();
  expect(screen.queryByText("Node not found.")).toBeNull();
});

it("preserves the selected node when returning from sign-in", async () => {
  mockApi([parent, child], child.id);
  await showNode(`/login?redirect=${encodeURIComponent(`/stake?nodeId=${child.id}`)}`, true);
  expect(await screen.findByRole("heading", { name: "Stake NEAR to Chicago" })).toBeTruthy();
});

it("carries a duplicate city's identity from its overview into the staking page", async () => {
  const otherParent = {
    ...parent,
    id: "00000000-0000-4000-8000-000000000003",
    slug: "missouri",
    name: "Missouri",
  };
  const otherChild = {
    ...child,
    id: "00000000-0000-4000-8000-000000000004",
    parentId: otherParent.id,
    name: "Chicago, Missouri",
  };
  mockApi([parent, child, otherParent, otherChild], otherChild.id);
  const router = await showNode(`/n/chicago?parentId=${otherParent.id}`);
  const link = await screen.findByRole("link", { name: "Stake to Chicago, Missouri" });
  const destination = new URL(link.getAttribute("href") ?? "", "http://localhost");
  expect(destination.searchParams.get("nodeId")).toBe(otherChild.id);
  await act(async () => {
    router.history.push(`${destination.pathname}${destination.search}`);
    await router.load();
  });
  expect(
    await screen.findByRole("heading", { name: "Stake NEAR to Chicago, Missouri" }),
  ).toBeTruthy();
  expect(screen.queryByText("Node not found.")).toBeNull();
});

it("navigates from a parent to the child's overview with its parent in the URL", async () => {
  mockApi();
  await showNode("/n/illinois");
  const link = await screen.findByRole("link", { name: /Chicago chicago.citynode.app/ });
  expect(link.getAttribute("href")).toBe(`/n/chicago?parentId=${parent.id}`);
  fireEvent.click(link);
  expect(await screen.findByRole("heading", { name: "Chicago", level: 1 })).toBeTruthy();
  expect(await screen.findByText("Stake inherited from Illinois.")).toBeTruthy();
});

it("keeps same-slug cities under different parents separate when navigating", async () => {
  const otherParent = {
    ...parent,
    id: "00000000-0000-4000-8000-000000000003",
    slug: "missouri",
    name: "Missouri",
  };
  const otherChild = {
    ...child,
    id: "00000000-0000-4000-8000-000000000004",
    parentId: otherParent.id,
    name: "Chicago, Missouri",
  };
  mockApi([parent, child, otherParent, otherChild]);
  const router = await showNode(`/n/chicago?parentId=${otherParent.id}`);
  expect(await screen.findByRole("heading", { name: "Chicago, Missouri", level: 1 })).toBeTruthy();
  expect(await screen.findByText("Stake inherited from Missouri.")).toBeTruthy();
  await act(() =>
    router.navigate({
      to: "/n/$slug",
      params: { slug: "chicago" },
      search: { parentId: parent.id },
    }),
  );
  expect(await screen.findByRole("heading", { name: "Chicago", level: 1 })).toBeTruthy();
  expect(await screen.findByText("Stake inherited from Illinois.")).toBeTruthy();
  expect(screen.queryByText("Stake inherited from Missouri.")).toBeNull();
});
