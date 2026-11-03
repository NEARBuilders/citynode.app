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
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { Near } from "near-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { createApiClient } from "@/lib/api";
import { createAuthClient } from "@/lib/auth";
import type { SputnikProposal } from "@/lib/sputnik-proposals";
import { proposalText, proposalTitle } from "./-node-dao-proposals";
import { Route as DetailRoute } from "./$slug_/proposals/$proposalId";
import { Route as ListRoute } from "./$slug_/proposals/index";

const DAO = "lisbon.sputnik-dao.near";
const NOW_NS = 1_760_000_000_000n * 1_000_000n;
const WEEK_NS = 604_800_000_000_000n;
const node = {
  id: "00000000-0000-4000-8000-000000000010",
  parentId: null,
  tenantId: "tenant",
  slug: "lisbon",
  name: "Lisbon",
  kind: "city",
  metadata: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

type DaoResponse = { daoAccountId: string | null; network: string | null } | "fail";

const state: {
  dao: DaoResponse;
  last: number;
  removed: Set<number>;
  kinds: Map<number, SputnikProposal["kind"]>;
  failPagesBelow: number | null;
  failNext: number;
  apiCalls: string[];
  expired: Set<number>;
} = {
  dao: { daoAccountId: DAO, network: "mainnet" },
  last: 0,
  removed: new Set(),
  kinds: new Map(),
  failPagesBelow: null,
  failNext: 0,
  apiCalls: [],
  expired: new Set(),
};
const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  state.dao = { daoAccountId: DAO, network: "mainnet" };
  state.last = 0;
  state.removed.clear();
  state.kinds.clear();
  state.failPagesBelow = null;
  state.failNext = 0;
  state.apiCalls = [];
  state.expired.clear();
});

function proposal(id: number): SputnikProposal {
  return {
    id,
    proposer: `member-${id}.near`,
    description: `Proposal number ${id}$$$$metadata`,
    kind: state.kinds.get(id) ?? {
      FunctionCall: {
        receiver_id: "lisbon.citynode.near",
        actions: [{ method_name: "set_page", args: "", deposit: "0", gas: "0" }],
      },
    },
    status: id % 2 === 0 ? "Approved" : "InProgress",
    vote_counts: {},
    votes: { "a.near": "Approve", "b.near": "Approve", "c.near": "Reject" },
    submission_time: (state.expired.has(id) ? NOW_NS - WEEK_NS - 1n : NOW_NS - 1n).toString(),
  };
}

function mockBackends() {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.spyOn(Near.prototype, "rpc", "get").mockReturnValue({
    getBlock: () => Promise.resolve({ header: { timestamp_nanosec: NOW_NS.toString() } }),
  } as never);
  vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method, args) => {
    if (method === "get_policy") {
      return Promise.resolve({ roles: [], proposal_period: WEEK_NS.toString() });
    }
    if (state.failNext > 0) {
      state.failNext -= 1;
      return Promise.reject(new Error("RPC unavailable"));
    }
    if (method === "get_last_proposal_id") return Promise.resolve(state.last);
    if (method === "get_proposal") {
      const { id } = args as { id: number };
      if (id >= state.last) {
        return Promise.reject(new Error("Contract call failed: get_proposal - ERR_NO_PROPOSAL"));
      }
      return Promise.resolve(proposal(id));
    }
    const { from_index, limit } = args as { from_index: number; limit: number };
    if (state.failPagesBelow !== null && from_index < state.failPagesBelow) {
      return Promise.reject(new Error("RPC unavailable"));
    }
    const ids = Array.from({ length: limit }, (_, i) => from_index + i).filter(
      (id) => id < state.last && !state.removed.has(id),
    );
    return Promise.resolve(ids.map(proposal));
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
      const method = url.pathname.split("/").at(-1) ?? "";
      if (url.pathname.startsWith("/api/rpc/")) state.apiCalls.push(method);
      switch (method) {
        case "resolveNodeBySlug":
          return Response.json({ json: args.slug === node.slug ? node : null });
        case "getNodeDao":
          if (state.dao === "fail") return Response.json({ json: null }, { status: 500 });
          return Response.json({ json: state.dao });
        default:
          throw new Error(`Unexpected API call: ${method}`);
      }
    }),
  );
}

async function show(url: string) {
  mockBackends();
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
  const list = ListRoute.update({
    ...ListRoute.options,
    getParentRoute: () => root,
    path: "/n/$slug/proposals",
    id: undefined,
  } as never);
  const detail = DetailRoute.update({
    ...DetailRoute.options,
    getParentRoute: () => root,
    path: "/n/$slug/proposals/$proposalId",
    id: undefined,
  } as never);
  const community = createRoute({ getParentRoute: () => root, path: "/n/$slug" });
  const explore = createRoute({ getParentRoute: () => root, path: "/explore" });
  const router = createRouter({
    routeTree: root.addChildren([list, detail, community, explore]),
    history: createMemoryHistory({ initialEntries: [url] }),
    context,
    defaultPendingMinMs: 0,
  });
  await router.load();
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("public Node DAO proposal list", () => {
  it("lists proposals signed out, newest first, and pages to older ones", async () => {
    state.last = 25;
    await show("/n/lisbon/proposals");

    const items = await screen.findAllByTestId("dao-proposals.item");
    expect(items).toHaveLength(20);
    const newest = within(items[0] as HTMLElement);
    expect(newest.getByText("Proposal #24")).toBeTruthy();
    expect(newest.getByText("Approved")).toBeTruthy();
    expect(newest.getByText("Proposed by member-24.near")).toBeTruthy();
    expect(newest.getByText("Calls set_page on lisbon.citynode.near")).toBeTruthy();
    expect(newest.getByText("Proposal number 24")).toBeTruthy();
    expect(items[0]?.getAttribute("href")).toBe("/n/lisbon/proposals/24");
    expect(screen.getByText(/Proposals to lisbon\.sputnik-dao\.near/)).toBeTruthy();
    expect(state.apiCalls).toEqual(["resolveNodeBySlug", "getNodeDao"]);

    fireEvent.click(screen.getByTestId("dao-proposals.show-older"));
    expect(await screen.findByText("Proposal #0")).toBeTruthy();
    expect(screen.getAllByTestId("dao-proposals.item")).toHaveLength(25);
    expect(screen.queryByTestId("dao-proposals.show-older")).toBeNull();
  });

  it("shows a retryable error when the DAO can't be read, never an empty list", async () => {
    state.last = 3;
    state.failNext = 1;
    await show("/n/lisbon/proposals");

    expect(await screen.findByTestId("dao-proposals.load-error")).toBeTruthy();
    expect(screen.queryByTestId("dao-proposals.empty")).toBeNull();

    fireEvent.click(screen.getByTestId("dao-proposals.load-error-retry"));
    expect(await screen.findByText("Proposal #2")).toBeTruthy();
  });

  it("keeps the loaded page when an older page fails, and retries it", async () => {
    state.last = 25;
    state.failPagesBelow = 5;
    await show("/n/lisbon/proposals");
    await screen.findByText("Proposal #24");

    fireEvent.click(screen.getByTestId("dao-proposals.show-older"));
    expect(await screen.findByTestId("dao-proposals.older-error")).toBeTruthy();
    expect(screen.getAllByTestId("dao-proposals.item")).toHaveLength(20);

    state.failPagesBelow = null;
    fireEvent.click(screen.getByTestId("dao-proposals.older-error-retry"));
    expect(await screen.findByText("Proposal #0")).toBeTruthy();
  });

  it("still reaches older proposals when the newest ones were all removed", async () => {
    state.last = 125;
    for (let id = 25; id < 125; id++) state.removed.add(id);
    await show("/n/lisbon/proposals");

    const older = await screen.findByTestId("dao-proposals.show-older");
    expect(screen.queryByTestId("dao-proposals.empty")).toBeNull();
    expect(screen.queryAllByTestId("dao-proposals.item")).toHaveLength(0);

    fireEvent.click(older);
    expect(await screen.findByText("Proposal #24")).toBeTruthy();
    expect(screen.getAllByTestId("dao-proposals.item")).toHaveLength(20);
  });

  it("shows a proposal still stored as in progress past its period as expired", async () => {
    state.last = 4;
    state.expired.add(1);
    await show("/n/lisbon/proposals");

    const items = await screen.findAllByTestId("dao-proposals.item");
    const expired = within(items[2] as HTMLElement);
    expect(expired.getByText("Proposal #1")).toBeTruthy();
    expect(await expired.findByText("Expired")).toBeTruthy();
    expect(within(items[0] as HTMLElement).getByText("Open")).toBeTruthy();
  });

  it("says when the DAO has no proposals yet", async () => {
    await show("/n/lisbon/proposals");
    expect(await screen.findByTestId("dao-proposals.empty")).toBeTruthy();
  });

  it("describes transfers and kinds it doesn't summarize by name", async () => {
    state.last = 2;
    state.kinds.set(1, { Transfer: { token_id: "", receiver_id: "fund.near", amount: "1" } });
    state.kinds.set(0, { ChangePolicy: { policy: {} } });
    await show("/n/lisbon/proposals");

    expect(await screen.findByText("Transfer to fund.near")).toBeTruthy();
    expect(screen.getByText("ChangePolicy proposal")).toBeTruthy();
  });

  it("says the community has no Node DAO when a person or the platform owns it", async () => {
    state.dao = { daoAccountId: null, network: null };
    await show("/n/lisbon/proposals");
    expect(await screen.findByTestId("dao-proposals.no-dao")).toBeTruthy();
    expect(Near.prototype.view).not.toHaveBeenCalled();
  });

  it("doesn't read testnet DAOs yet", async () => {
    state.dao = { daoAccountId: "lisbon.sputnik-dao.testnet", network: "testnet" };
    await show("/n/lisbon/proposals");
    expect(await screen.findByTestId("dao-proposals.testnet")).toBeTruthy();
    expect(Near.prototype.view).not.toHaveBeenCalled();
  });

  it("offers a retry when the DAO lookup fails", async () => {
    state.dao = "fail";
    await show("/n/lisbon/proposals");
    expect(await screen.findByTestId("dao-proposals.dao-error")).toBeTruthy();

    state.dao = { daoAccountId: DAO, network: "mainnet" };
    fireEvent.click(screen.getByTestId("dao-proposals.dao-error-retry"));
    expect(await screen.findByTestId("dao-proposals.empty")).toBeTruthy();
  });

  it("offers a way back to Explore when the community doesn't exist", async () => {
    await show("/n/nowhere/proposals");
    expect(await screen.findByTestId("dao-proposals.back-to-explore")).toBeTruthy();
    expect(state.apiCalls).not.toContain("getNodeDao");
  });
});

describe("public Node DAO proposal detail", () => {
  it("reads a proposal older than the first page by ID, with status, proposer and votes", async () => {
    state.last = 60;
    await show("/n/lisbon/proposals/3");

    const detail = await screen.findByTestId("dao-proposals.detail");
    expect(within(detail).getByText("Proposal #3")).toBeTruthy();
    expect(within(detail).getByText("Open")).toBeTruthy();
    expect(screen.getByTestId("dao-proposals.proposer").textContent).toBe("member-3.near");
    expect(within(detail).getByText("2 approve · 1 reject")).toBeTruthy();
    expect(within(detail).getByText("Proposal number 3")).toBeTruthy();
    expect(Near.prototype.view).toHaveBeenCalledWith(DAO, "get_proposal", { id: 3 });
  });

  it("shows an expired proposal as expired on its own page", async () => {
    state.last = 5;
    state.expired.add(3);
    await show("/n/lisbon/proposals/3");

    const detail = await screen.findByTestId("dao-proposals.detail");
    expect(await within(detail).findByText("Expired")).toBeTruthy();
    expect(within(detail).queryByText("Open")).toBeNull();
  });

  it("says a missing or removed proposal wasn't found", async () => {
    state.last = 5;
    await show("/n/lisbon/proposals/42");
    expect(await screen.findByText("Proposal not found")).toBeTruthy();
    expect(
      screen.getByText("Proposal #42 doesn't exist in lisbon.sputnik-dao.near, or it was removed."),
    ).toBeTruthy();
  });

  it("treats a malformed ID as not found without reading the chain", async () => {
    state.last = 5;
    await show("/n/lisbon/proposals/abc");
    expect(await screen.findByText("Proposal not found")).toBeTruthy();
    expect(Near.prototype.view).not.toHaveBeenCalled();
  });

  it("offers a retry when the proposal can't be read", async () => {
    state.last = 5;
    state.failNext = 1;
    await show("/n/lisbon/proposals/2");
    expect(await screen.findByTestId("dao-proposals.detail-error")).toBeTruthy();

    fireEvent.click(screen.getByTestId("dao-proposals.detail-error-retry"));
    expect(await screen.findByTestId("dao-proposals.detail")).toBeTruthy();
  });
});

describe("proposal descriptions", () => {
  const trezu = "* Title: Vote abstain <br>* Summary: vote.dao.vote()$$$$meta";

  it("turns Trezu line breaks into lines and drops its labels and metadata", () => {
    expect(proposalText(trezu)).toBe("Vote abstain\nvote.dao.vote()");
  });

  it("uses the Title line in the list, or the first line", () => {
    expect(proposalTitle(trezu)).toBe("Vote abstain");
    expect(proposalTitle("Set treasury policy\nmore")).toBe("Set treasury policy");
    expect(proposalTitle("")).toBe("");
  });
});
