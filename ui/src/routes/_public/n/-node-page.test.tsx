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
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { Near } from "near-kit";
import { afterEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { render } from "@/i18n/test-render";
import { createApiClient } from "@/lib/api";
import { createAuthClient, type SessionData, sessionQueryOptions } from "@/lib/auth";
import { teamWorkspaceQueryKey } from "@/lib/team-workspace";
import { Route as StakeRoute } from "../stake";
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
const memberCounts = new Map<string, { count: number | null; observedAt: string | null }>();
const listings = new Map<string, Record<string, unknown> | "fail">();

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  memberCounts.clear();
  listings.clear();
});

function mockApi(nodes = [parent, child], ownPoolNodeId?: string) {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method) => {
    const values: Record<string, unknown> = {
      get_total_staked_balance: "1000000000000000000000000",
      get_reward_fee_fraction: { numerator: 5, denominator: 100 },
      get_number_of_accounts: 1,
      get_accounts: [{ account_id: "staker.near", staked_balance: "1000000000000000000000000" }],
    };
    return Promise.resolve(values[method] ?? null);
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const requestBody =
        init?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
      const body = JSON.parse(
        typeof requestBody === "string" ? requestBody : (url.searchParams.get("data") ?? "{}"),
      );
      if (url.pathname === "/api/auth/get-session") return Response.json(null);
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
        case "getNodeMemberCount":
          return Response.json({
            json: memberCounts.get(args.nodeId) ?? { count: null, observedAt: null },
          });
        case "getDiscoveryNode": {
          const listing = listings.get(args.nodeId);
          if (listing === "fail") return Response.json({ json: null }, { status: 500 });
          return Response.json({ json: listing ?? null });
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

async function showNode(url: string, signedIn = false, allowedAreas: string[] | null = null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(queryClient);
  if (allowedAreas)
    queryClient.setQueryData(teamWorkspaceQueryKey, {
      teams: [],
      activeTeam: { id: "team", name: "Team", areas: allowedAreas },
      allowedAreas,
    });
  if (signedIn)
    queryClient.setQueryData(["session"], {
      user: { id: "preview-user" },
      session: { id: "preview-session" },
    });
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
        sessionQueryOptions(ctx.authClient).queryKey,
      );
      if (session?.user) {
        throw redirect({ to: target });
      }
    },
  });
  const dashboardRoute = createRoute({ getParentRoute: () => root, path: "/dashboard" });
  const router = createRouter({
    routeTree: root.addChildren([route, stakeRoute, loginRoute, dashboardRoute]),
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
  expect(await screen.findByRole("heading", { level: 1, name: /Stake.*Chicago/ })).toBeTruthy();
});

it("lets anonymous visitors browse a pool and asks them to sign in to stake", async () => {
  mockApi([parent, child], child.id);
  await showNode(`/stake?nodeId=${child.id}`);
  expect(await screen.findByRole("heading", { level: 1, name: /Stake.*Chicago/ })).toBeTruthy();
  const signIn = await screen.findByTestId("stake.sign-in");
  const destination = new URL(signIn.getAttribute("href") ?? "", "http://localhost");
  expect(destination.pathname).toBe("/login");
  expect(destination.searchParams.get("redirect")).toBe(`/stake?nodeId=${child.id}`);
  expect(screen.queryByTestId("stake.connect-wallet")).toBeNull();
});

it.each([
  ["stake"],
  ["events"],
  ["finance"],
  ["node-operations"],
])("keeps signed-in members of an active %s team on the staking page", async (area) => {
  mockApi([parent, child], child.id);
  const router = await showNode(`/stake?nodeId=${child.id}`, true, [area]);
  expect(router.state.location.pathname).toBe("/stake");
  expect(await screen.findByTestId("stake.connect-wallet")).toBeTruthy();
  expect(screen.queryByTestId("stake.sign-in")).toBeNull();
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
    await screen.findByRole("heading", { level: 1, name: /Stake.*Chicago, Missouri/ }),
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

it("links the header stake action to the same-origin stake page", async () => {
  mockApi([parent, child], child.id);
  await showNode("/n/chicago");
  const stake = await screen.findByTestId("node-page.stake-button");
  expect(stake.getAttribute("href")).toBe(`/stake?nodeId=${child.id}`);
});

it("offers a way back to Explore when the community does not exist", async () => {
  mockApi();
  await showNode("/n/atlantis");
  expect(await screen.findByRole("heading", { name: "Community not found" })).toBeTruthy();
  expect(screen.getByTestId("node-page.back-to-explore").getAttribute("href")).toBe("/explore");
});

it("shows the community's last observed member count with its observation time", async () => {
  mockApi();
  memberCounts.set(child.id, { count: 42, observedAt: "2026-10-20T10:00:00.000Z" });
  await showNode("/n/chicago");
  expect((await screen.findByTestId("node-page.member-count-value")).textContent).toBe("42");
  const observed = screen.getByTestId("node-page.member-count-observed");
  expect(observed.textContent).toContain("Last updated");
  expect(observed.querySelector("time")?.getAttribute("dateTime")).toBe("2026-10-20T10:00:00.000Z");
  expect(screen.getByTestId("node-page.member-count").textContent).toContain("Members");
});

it("says the member count is not available before it was ever observed", async () => {
  mockApi();
  await showNode("/n/chicago");
  expect((await screen.findByTestId("node-page.member-count-unavailable")).textContent).toBe(
    "Not available",
  );
  expect(screen.queryByTestId("node-page.member-count-value")).toBeNull();
});

function listing(nodeId: string, updates: Record<string, unknown>[]) {
  return {
    nodeId,
    summary: "Builders meeting every month.",
    location: "Chicago",
    region: "North America",
    latitude: null,
    longitude: null,
    channels: [{ label: "Telegram", url: "https://t.me/example" }],
    published: true,
    featured: null,
    active: true,
    activityReason: "Recently active",
    upcoming: false,
    events: [],
    updates,
    name: "Chicago",
    slug: "chicago",
    parentId: parent.id,
    kind: "city",
  };
}

const update = {
  id: "00000000-0000-4000-8000-0000000000a1",
  ownerNodeId: child.id,
  nodeIds: [child.id],
  kind: "social",
  title: "Recap of the October meetup",
  summary: "",
  url: "https://example.com/posts/october-recap",
  source: "Example Blog",
  publishedAt: "2026-10-20T10:00:00.000Z",
  startsAt: null,
  endsAt: null,
  timezone: "UTC",
  venue: "",
  status: "published",
};

it("shows the latest Social Updates with their source, date and original link", async () => {
  mockApi();
  listings.set(child.id, listing(child.id, [update]));
  await showNode("/n/chicago");
  const section = await screen.findByTestId("node-page.updates");
  expect(section.textContent).toContain("Latest updates");
  expect(section.textContent).toContain("Recap of the October meetup");
  expect(section.textContent).toContain("Oct");
  expect(section.textContent).toContain("20");
  const original = screen.getByTestId(`discovery-activity-outbound-${update.id}`);
  expect(original.textContent).toContain("Example Blog");
  expect(original.getAttribute("href")).toBe(update.url);
  expect(screen.getByRole("link", { name: /Telegram/ }).getAttribute("href")).toBe(
    "https://t.me/example",
  );
});

it("leaves out the updates section when the listing has none", async () => {
  mockApi();
  listings.set(child.id, listing(child.id, []));
  await showNode("/n/chicago");
  expect(await screen.findByText("Builders meeting every month.")).toBeTruthy();
  expect(screen.queryByTestId("node-page.updates")).toBeNull();
  expect(screen.queryByText("Latest updates")).toBeNull();
});

it("still shows the community when its public listing can't be read", async () => {
  mockApi();
  listings.set(child.id, "fail");
  await showNode("/n/chicago");
  expect(await screen.findByRole("heading", { name: "Chicago", level: 1 })).toBeTruthy();
  expect(await screen.findByTestId("node-page.stats")).toBeTruthy();
  expect(screen.queryByTestId("node-page.updates")).toBeNull();
});

it("never shows the members-only bulletin on the public page", async () => {
  mockApi([parent, { ...child, metadata: { bulletin: "Members meet at the back door" } }]);
  listings.set(child.id, listing(child.id, [update]));
  await showNode("/n/chicago");
  await screen.findByTestId("node-page.updates");
  expect(screen.queryByText("Members meet at the back door")).toBeNull();
});
