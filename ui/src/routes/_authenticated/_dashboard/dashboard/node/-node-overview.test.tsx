// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { Near } from "near-kit";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { render } from "@/i18n/test-render";
import type { AuthRequestContext } from "@/lib/auth";
import { memberDirectoryChannelName } from "@/lib/queries/member-directory";
import { requireTeamArea } from "@/lib/team-workspace";
import { Route } from "./index";

const DAO = "example.sputnik-dao.near";
const POOL = "example.poolv1.near";

const harness = vi.hoisted(() => ({
  nearAccount: null as string | null,
  routeContext: {} as Record<string, unknown>,
  listing: (() => Promise.resolve(null)) as () => Promise<unknown>,
  getOnboardingRedemptions: (() => Promise.resolve(null)) as (input: unknown) => Promise<unknown>,
  attendanceCalls: [] as string[],
  memberDirectory: {
    optedIn: false,
    directory: (() => Promise.resolve({ count: 0, observedAt: "", members: [] })) as (input: {
      organizationId: string;
    }) => Promise<unknown>,
    nodeCount: (() => Promise.resolve({ count: null, observedAt: null })) as (input: {
      nodeId: string;
    }) => Promise<unknown>,
    setOptIn: null as ((optedIn: boolean) => Promise<unknown>) | null,
    readOptIn: null as (() => Promise<{ optedIn: boolean }>) | null,
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useRouteContext: () => harness.routeContext,
  }),
  Link: ({
    children,
    to,
    params,
    hash,
    "data-testid": testId,
  }: {
    children?: ReactNode;
    to?: string;
    params?: { accountId?: string };
    hash?: string;
    "data-testid"?: string;
  }) => (
    <a
      href={`${to === "/$accountId" ? `/${params?.accountId}` : "/dashboard"}${hash ? `#${hash}` : ""}`}
      data-testid={testId}
    >
      {children}
    </a>
  ),
  redirect: (options: unknown) => ({ redirect: options }),
}));

vi.mock("@/app", () => ({
  buildTenantUrl: (label: string, gatewayId: string) => `https://${label}.${gatewayId}`,
  getActiveRuntime: () => ({ gatewayId: "citynode.app" }),
  useApiClient: () => ({
    auth: {
      getDao: async () => ({ daoAccountId: DAO, daoNetwork: "mainnet" }),
      getOnboardingRedemptions: (input: unknown) => harness.getOnboardingRedemptions(input),
    },
    listDiscoveryActivities: async () => [],
    getDiscoveryNode: () => harness.listing(),
    getMemberDirectoryOptIn: async () =>
      harness.memberDirectory.readOptIn
        ? harness.memberDirectory.readOptIn()
        : { optedIn: harness.memberDirectory.optedIn },
    setMemberDirectoryOptIn: async ({ optedIn }: { optedIn: boolean }) => {
      if (harness.memberDirectory.setOptIn) return harness.memberDirectory.setOptIn(optedIn);
      harness.memberDirectory.optedIn = optedIn;
      return { optedIn };
    },
    getMemberDirectory: (input: { organizationId: string }) =>
      harness.memberDirectory.directory(input),
    getNodeMemberCount: (input: { nodeId: string }) => harness.memberDirectory.nodeCount(input),
    reconcileAttendance: async (input: { organizationId: string }) => {
      harness.attendanceCalls.push(`reconcile:${input.organizationId}`);
      return { events: 1, truncated: [], failed: [] };
    },
    getMyAttendance: async (input: { organizationId?: string }) => {
      harness.attendanceCalls.push(`read:${input.organizationId}`);
      return {
        events: [
          {
            organizationId: "org-1",
            communityName: "Example city",
            eventId: "event-1",
            eventName: "Builders Night",
            checkedInAt: "2026-10-10T18:30:00.000Z",
            startsAt: null,
          },
        ],
        unclassified: [],
        communities: [],
      };
    },
  }),
  useAuthClient: () => ({
    near: { getNearClient: () => new Near({ network: "mainnet" }) },
  }),
}));

vi.mock("@/lib/use-near-account", () => ({
  useNearAccount: () => harness.nearAccount,
}));

vi.mock("@/lib/dao-connect", () => ({
  useDaoConnection: () => ({
    status: "idle",
    daoAccountId: null,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
  useDaoAutoRestore: () => undefined,
  describeDaoError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  harness.memberDirectory.optedIn = false;
  harness.memberDirectory.directory = () =>
    Promise.resolve({ count: 0, observedAt: "", members: [] });
  harness.memberDirectory.nodeCount = () => Promise.resolve({ count: null, observedAt: null });
  harness.memberDirectory.setOptIn = null;
  harness.memberDirectory.readOptIn = null;
  harness.listing = () => Promise.resolve(null);
  harness.attendanceCalls.length = 0;
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

const policy = {
  roles: [
    {
      name: "Requestor",
      kind: { Group: ["requestor.near"] },
      permissions: ["call:AddProposal", "transfer:AddProposal"],
    },
    {
      name: "Approver",
      kind: { Group: ["approver.near"] },
      permissions: ["call:VoteApprove", "call:VoteReject"],
    },
  ],
  proposal_period: "604800000000000",
};

function stubChain(
  policyResult: Record<string, unknown> | Error = policy,
  delegation: string | Error = "0",
) {
  vi.spyOn(Near.prototype, "rpc", "get").mockReturnValue({
    getBlock: async () => ({
      header: { timestamp_nanosec: (BigInt(Date.now()) * 1_000_000n).toString() },
    }),
    call: async () => ({ current_validators: [{ account_id: POOL }], next_validators: [] }),
  } as never);
  vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method) => {
    if (method === "delegation_balance_of")
      return delegation instanceof Error ? Promise.reject(delegation) : Promise.resolve(delegation);
    if (method === "get_policy")
      return policyResult instanceof Error
        ? Promise.reject(policyResult)
        : Promise.resolve(policyResult);
    if (method === "get_account")
      return Promise.resolve({
        account_id: DAO,
        staked_balance: "2500000000000000000000000",
        unstaked_balance: "0",
        can_withdraw: true,
      });
    if (method === "get_last_proposal_id") return Promise.resolve(0);
    if (method === "get_owner_id") return Promise.resolve(DAO);
    if (method === "get_reward_fee_fraction")
      return Promise.resolve({ numerator: 100, denominator: 100 });
    if (method === "is_staking_paused") return Promise.resolve(false);
    return Promise.resolve(null);
  });
}

function renderOverview({
  nearAccount,
  canManage = false,
  inFinanceTeam = false,
  canOrganize = false,
  network = "mainnet",
}: {
  nearAccount: string | null;
  canManage?: boolean;
  inFinanceTeam?: boolean;
  canOrganize?: boolean;
  network?: "mainnet" | "testnet";
}) {
  harness.nearAccount = nearAccount;
  harness.routeContext = {
    runtimeConfig: {},
    selectedNode: { id: "node-1", metadata: {} },
    summary: {
      validators: [],
      children: [],
      stakingValidators: {
        sourceNodeId: "node-1",
        validators: [
          {
            id: "validator-1",
            accountId: POOL,
            network,
            protocol: "near",
            isDefault: true,
            role: "member",
          },
        ],
      },
    },
    stakingSourceNode: null,
    tenant: { orgId: "org-1", accountId: "example.citynode.near", ownerKind: "platform" },
    auth: { activeOrganizationId: "org-1" },
    canManage,
    inFinanceTeam,
    canOrganize,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const Overview = (Route as unknown as { options: { component: ComponentType } }).options
    .component;
  render(
    <QueryClientProvider client={client}>
      <Overview />
    </QueryClientProvider>,
  );
  return client;
}

describe("node overview team stake visibility", () => {
  it("shows the team stake to a member of a team with the Finance area", async () => {
    stubChain();
    renderOverview({ nearAccount: "member.near", inFinanceTeam: true });
    await screen.findByTestId("dashboard-node.team-stake");
    expect(await screen.findByText("2.5 NEAR")).toBeTruthy();
  });

  it("shows the team stake to an account the DAO policy lets propose", async () => {
    stubChain();
    renderOverview({ nearAccount: "requestor.near" });
    await screen.findByTestId("dashboard-node.team-stake");
    expect(await screen.findByText("2.5 NEAR")).toBeTruthy();
  });

  it("hides the team stake from a plain member", async () => {
    stubChain();
    const client = renderOverview({ nearAccount: "member.near" });
    await waitFor(() =>
      expect(client.getQueryState(["team-pool-policy", DAO])?.status).toBe("success"),
    );
    expect(screen.getByTestId("node-validators")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-node.team-stake")).toBeNull();
  });

  const holderPolicy = {
    roles: [
      { name: "Holders", kind: { Member: "100" }, permissions: ["call:AddProposal"] },
      ...policy.roles.slice(1),
    ],
    proposal_period: policy.proposal_period,
  };

  it("shows the team stake to an account whose delegated balance meets a Member role", async () => {
    stubChain(holderPolicy, "100");
    renderOverview({ nearAccount: "holder.near" });
    await screen.findByTestId("dashboard-node.team-stake");
    const button = (await screen.findByTestId(
      "dashboard-node.team-stake-unstake",
    )) as HTMLButtonElement;
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("shows the team stake paused when a Member role's delegated balance can't be read", async () => {
    stubChain(holderPolicy, new Error("RPC unavailable"));
    renderOverview({ nearAccount: "holder.near" });
    await screen.findByTestId("dashboard-node.team-stake-read-failed");
    expect(
      (screen.getByTestId("dashboard-node.team-stake-unstake") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows the team stake paused when the DAO policy can't be read", async () => {
    stubChain(new Error("RPC unavailable"));
    renderOverview({ nearAccount: "member.near" });
    await screen.findByTestId("dashboard-node.team-stake-read-failed");
    expect(
      (screen.getByTestId("dashboard-node.team-stake-unstake") as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});

describe("node overview team stake on a testnet DAO", () => {
  it.each([
    ["a member with a NEAR account", { nearAccount: "member.near" }],
    ["an owner", { nearAccount: "member.near", canManage: true }],
    ["an account the policy would let propose", { nearAccount: "requestor.near" }],
  ])("shows the stake paused to %s", async (_who, options) => {
    stubChain();
    renderOverview({ ...options, network: "testnet" });
    await screen.findByTestId("dashboard-node.team-stake-rules-unreadable");
    expect(await screen.findByText("2.5 NEAR")).toBeTruthy();
    expect(
      (screen.getByTestId("dashboard-node.team-stake-unstake") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("hides the stake from a member without a NEAR account", async () => {
    stubChain();
    renderOverview({ nearAccount: null, network: "testnet" });
    await screen.findByTestId("node-validators");
    expect(screen.queryByTestId("dashboard-node.team-stake")).toBeNull();
  });
});

describe("node overview team stake actions", () => {
  async function unstakeButton() {
    await screen.findByText("2.5 NEAR");
    return screen.getByTestId("dashboard-node.team-stake-unstake") as HTMLButtonElement;
  }

  it("lets a DAO proposer start an unstake", async () => {
    stubChain();
    renderOverview({ nearAccount: "requestor.near" });
    const button = await unstakeButton();
    await waitFor(() => expect(button.disabled).toBe(false));
    expect(screen.queryByTestId("dashboard-node.team-stake-proposers-only")).toBeNull();
  });

  it.each([
    ["a Finance member without a DAO role", { nearAccount: "member.near", inFinanceTeam: true }],
    ["an owner without a DAO role", { nearAccount: "member.near", canManage: true }],
    [
      "a Finance member who can only approve",
      { nearAccount: "approver.near", inFinanceTeam: true },
    ],
  ])("shows the stake to %s with actions disabled", async (_who, options) => {
    stubChain();
    renderOverview(options);
    await screen.findByTestId("dashboard-node.team-stake-proposers-only");
    expect((await unstakeButton()).disabled).toBe(true);
  });
});

describe("node overview team area gating", () => {
  const treasury = { id: "team-fin", name: "Treasury", areas: ["finance", "stake"] };
  const operations = { id: "team-ops", name: "Operations", areas: ["node-operations"] };

  async function gate(pathname: string, activeTeamId: string | null) {
    const getContext = vi.fn().mockResolvedValue({
      user: { role: null },
      organization: {
        activeOrganizationId: "org-1",
        member: { id: "m1", role: "member" },
        teams: [treasury, operations],
        activeTeamId,
      },
    } as AuthRequestContext);
    const queryClient = new QueryClient();
    clients.push(queryClient);
    return requireTeamArea({
      context: { apiClient: { auth: { getContext } } as unknown as ApiClient, queryClient },
      location: { pathname },
    }).then(
      () => "allowed",
      (error: { redirect?: { search?: { restricted?: string } } }) =>
        `restricted:${error.redirect?.search?.restricted}`,
    );
  }

  it("lets a Treasury-active member open the overview and proposals but not the work-area pages", async () => {
    expect(await gate("/dashboard/node", "team-fin")).toBe("allowed");
    expect(await gate("/dashboard/node/proposals", "team-fin")).toBe("allowed");
    expect(await gate("/stake", "team-fin")).toBe("allowed");
    expect(await gate("/nodes/node-1/content", "team-fin")).toBe("restricted:node-operations");
    expect(await gate("/tenant/tenant-1", "team-fin")).toBe("restricted:node-operations");
  });

  it("keeps the overview reachable with All areas or an Operations team active", async () => {
    expect(await gate("/dashboard/node", null)).toBe("allowed");
    expect(await gate("/dashboard/node", "team-ops")).toBe("allowed");
    expect(await gate("/dashboard/node/proposals", "team-ops")).toBe("allowed");
  });
});

describe("node overview code redemptions", () => {
  const stats = [
    "dashboard-node.stat-redeemed-this-month",
    "dashboard-node.stat-new-members-this-month",
    "dashboard-node.stat-redeemed-last-month",
    "dashboard-node.stat-new-members-last-month",
  ];

  it("keeps the rest of the overview when the figures fail to load", async () => {
    stubChain();
    harness.getOnboardingRedemptions = () => Promise.reject(new Error("unavailable"));
    renderOverview({ nearAccount: null, canOrganize: true });
    expect((await screen.findByTestId("dashboard-node.redemptions-error")).textContent).toBe(
      "Couldn't load code redemptions",
    );
    expect(screen.getByTestId("node-validators")).toBeTruthy();
    for (const testId of stats) expect(screen.queryByTestId(testId)).toBeNull();
  });

  it("neither shows nor requests the figures for other members", async () => {
    stubChain();
    const requested: unknown[] = [];
    harness.getOnboardingRedemptions = async (input) => {
      requested.push(input);
      return null;
    };
    renderOverview({ nearAccount: null, canManage: true });
    await screen.findByTestId("node-validators");
    for (const testId of stats) expect(screen.queryByTestId(testId)).toBeNull();
    expect(requested).toEqual([]);
  });
});

describe("node overview member directory", () => {
  const observedAt = "2026-10-20T10:00:00.000Z";
  const longName = "Alexandria Catherine Montgomery-Wellington of the Greater Chicago Area";

  function directoryWith(members: unknown[], count = 3) {
    const requested: string[] = [];
    harness.memberDirectory.directory = async ({ organizationId }) => {
      requested.push(organizationId);
      return {
        count,
        observedAt,
        members: harness.memberDirectory.optedIn
          ? [...members, { userId: "self", name: "Me Myself", accountId: "me.near" }]
          : members,
      };
    };
    return requested;
  }

  it("keeps the toggle off by default and says it applies to every community", async () => {
    stubChain();
    directoryWith([]);
    renderOverview({ nearAccount: null });
    const toggle = await screen.findByTestId("dashboard-node.member-opt-in");
    await waitFor(() => expect(toggle.getAttribute("aria-disabled")).not.toBe("true"));
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("Show my name to my communities")).toBeTruthy();
    expect(
      screen.getByText("Applies to every community you belong to. Your email is never shown."),
    ).toBeTruthy();
  });

  it("shows the member count and only the names members chose to share", async () => {
    stubChain();
    const requested = directoryWith([
      { userId: "alice", name: "Alice", accountId: "alice.near" },
      { userId: "bob", name: "Bob", accountId: null },
      { userId: "blank", name: null, accountId: null },
    ]);
    renderOverview({ nearAccount: null });
    expect((await screen.findByTestId("dashboard-node.member-count-value")).textContent).toBe("3");
    const names = screen.getAllByTestId("dashboard-node.member").map((item) => item.textContent);
    expect(names).toEqual(["Alice", "Bob", "Unnamed member"]);
    expect(screen.getByRole("link", { name: "Alice" }).getAttribute("href")).toBe("/alice.near");
    expect(screen.queryByRole("link", { name: "Bob" })).toBeNull();
    expect(screen.queryByText(/@/)).toBeNull();
    expect(requested).toEqual(["org-1"]);
  });

  it("wraps long names inside a 375px screen instead of overflowing", async () => {
    stubChain();
    directoryWith([{ userId: "long", name: longName, accountId: null }]);
    renderOverview({ nearAccount: null });
    const item = await screen.findByTestId("dashboard-node.member");
    expect(item.textContent).toBe(longName);
    expect(item.className).toContain("break-words");
    expect(item.className).toContain("min-w-0");
    expect(screen.getByTestId("dashboard-node.member-list").className).toContain("min-w-0");
  });

  it("reloads my own view once when I change the toggle", async () => {
    stubChain();
    const requested = directoryWith([]);
    renderOverview({ nearAccount: null });
    expect(await screen.findByTestId("dashboard-node.members-empty")).toBeTruthy();
    const toggle = screen.getByTestId("dashboard-node.member-opt-in");
    await waitFor(() => expect(toggle.getAttribute("aria-disabled")).not.toBe("true"));
    await act(async () => fireEvent.click(toggle));
    expect(await screen.findByRole("link", { name: "Me Myself" })).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requested).toEqual(["org-1", "org-1"]);
  });

  it("adds my name when I turn the toggle on and removes it when I turn it off", async () => {
    stubChain();
    directoryWith([]);
    renderOverview({ nearAccount: null });
    expect(await screen.findByTestId("dashboard-node.members-empty")).toBeTruthy();
    const toggle = screen.getByTestId("dashboard-node.member-opt-in");
    await waitFor(() => expect(toggle.getAttribute("aria-disabled")).not.toBe("true"));
    await act(async () => fireEvent.click(toggle));
    expect((await screen.findByRole("link", { name: "Me Myself" })).getAttribute("href")).toBe(
      "/me.near",
    );
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(toggle.getAttribute("aria-disabled")).not.toBe("true"));
    await act(async () => fireEvent.click(toggle));
    expect(await screen.findByTestId("dashboard-node.members-empty")).toBeTruthy();
    expect(screen.queryByText("Me Myself")).toBeNull();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("refreshes a second open view's names after I opt out elsewhere, not on every focus", async () => {
    stubChain();
    harness.memberDirectory.optedIn = true;
    const requested = directoryWith([]);
    renderOverview({ nearAccount: null });
    expect(await screen.findByText("Me Myself")).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(requested).toEqual(["org-1"]);
    harness.memberDirectory.optedIn = false;
    const otherView = new BroadcastChannel(memberDirectoryChannelName);
    otherView.postMessage("changed");
    otherView.close();
    await waitFor(() => expect(screen.queryByText("Me Myself")).toBeNull());
  });

  it("explains a failed setting read and lets me retry it", async () => {
    stubChain();
    directoryWith([]);
    const readOptIn = vi
      .fn()
      .mockRejectedValueOnce(new Error("unavailable"))
      .mockResolvedValue({ optedIn: true });
    harness.memberDirectory.readOptIn = readOptIn;
    renderOverview({ nearAccount: null });
    expect(
      (await screen.findByTestId("dashboard-node.member-opt-in-load-error")).textContent,
    ).toContain("Couldn't load your name setting.");
    const toggle = screen.getByTestId("dashboard-node.member-opt-in");
    expect(toggle.getAttribute("aria-disabled")).toBe("true");
    await act(async () =>
      fireEvent.click(screen.getByTestId("dashboard-node.member-opt-in-retry")),
    );
    await waitFor(() => expect(toggle.getAttribute("aria-checked")).toBe("true"));
    expect(toggle.getAttribute("aria-disabled")).not.toBe("true");
    expect(screen.queryByTestId("dashboard-node.member-opt-in-load-error")).toBeNull();
    expect(readOptIn).toHaveBeenCalledTimes(2);
  });

  it("keeps my setting and explains the failure when saving it fails", async () => {
    stubChain();
    directoryWith([]);
    harness.memberDirectory.setOptIn = () => Promise.reject(new Error("unavailable"));
    renderOverview({ nearAccount: null });
    const toggle = await screen.findByTestId("dashboard-node.member-opt-in");
    await waitFor(() => expect(toggle.getAttribute("aria-disabled")).not.toBe("true"));
    await act(async () => fireEvent.click(toggle));
    expect((await screen.findByTestId("dashboard-node.member-opt-in-error")).textContent).toBe(
      "Couldn't update your name setting. Try again.",
    );
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("falls back to the last observed count when the live list fails", async () => {
    stubChain();
    harness.memberDirectory.directory = () => Promise.reject(new Error("unavailable"));
    harness.memberDirectory.nodeCount = async () => ({ count: 7, observedAt });
    renderOverview({ nearAccount: null });
    expect((await screen.findByTestId("dashboard-node.member-count-value")).textContent).toBe("7");
    expect(screen.getByTestId("dashboard-node.member-count-observed").textContent).toContain(
      "Last updated",
    );
    expect(screen.getByTestId("dashboard-node.members-error").textContent).toBe(
      "Couldn't load the member list.",
    );
  });

  it("says the count is not available when nothing was ever observed", async () => {
    stubChain();
    harness.memberDirectory.directory = () => Promise.reject(new Error("unavailable"));
    renderOverview({ nearAccount: null });
    expect((await screen.findByTestId("dashboard-node.member-count-unavailable")).textContent).toBe(
      "Not available",
    );
  });
});

const listing = {
  updates: [
    {
      id: "00000000-0000-4000-8000-0000000000a1",
      ownerNodeId: "node-1",
      nodeIds: ["node-1"],
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
    },
  ],
  channels: [
    { label: "A very long community channel label for phones", url: "https://t.me/example" },
  ],
  events: [],
};

describe("node overview for members", () => {
  it("says what membership gives them, linking only to sections on the page", async () => {
    stubChain();
    harness.listing = () => Promise.resolve(listing);
    renderOverview({ nearAccount: null });
    await screen.findByTestId("dashboard-node.updates");
    const intro = screen.getByTestId("dashboard-node.member-intro");
    expect(intro.textContent).toContain("What membership gives you:");
    const targets = [...intro.querySelectorAll("a")].map(
      (link) => link.getAttribute("href")?.split("#")[1],
    );
    expect(targets).toEqual(["coming-up", "updates", "people"]);
    for (const target of targets) expect(document.getElementById(target ?? "")).toBeTruthy();
  });

  it("shows Social Updates and channels from the public listing", async () => {
    stubChain();
    harness.listing = () => Promise.resolve(listing);
    renderOverview({ nearAccount: null });
    const updates = await screen.findByTestId("dashboard-node.updates");
    expect(updates.textContent).toContain("Latest updates");
    expect(
      screen.getByTestId(`discovery-activity-outbound-${listing.updates[0]?.id}`).textContent,
    ).toContain("Example Blog");
    const channels = screen.getByTestId("dashboard-node.channels");
    expect(channels.textContent).toContain("Where to find them");
    expect(channels.querySelector("a")?.getAttribute("href")).toBe("https://t.me/example");
  });

  it("leaves both sections out when the community has no public listing", async () => {
    stubChain();
    renderOverview({ nearAccount: null });
    await screen.findByTestId("dashboard-node.members");
    expect(screen.queryByTestId("dashboard-node.updates")).toBeNull();
    expect(screen.queryByTestId("dashboard-node.channels")).toBeNull();
    const intro = screen.getByTestId("dashboard-node.member-intro");
    expect(intro.querySelector('[data-testid="dashboard-node.member-intro-updates"]')).toBeNull();
  });

  it("keeps the rest of Overview when the public listing can't be read", async () => {
    stubChain();
    harness.listing = () => Promise.reject(new Error("discovery unavailable"));
    const client = renderOverview({ nearAccount: null });
    await waitFor(() =>
      expect(client.getQueryState(["discovery-node", "node-1"])?.status).toBe("error"),
    );
    expect(screen.getByTestId("dashboard-node.member-intro")).toBeTruthy();
    expect(screen.getByTestId("node-validators")).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.members")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-node.updates")).toBeNull();
  });
});

describe("node overview attendance", () => {
  it("shows a plain member their events in this community without syncing", async () => {
    stubChain();
    renderOverview({ nearAccount: null });
    expect((await screen.findByTestId("dashboard-node.attendance-event")).textContent).toContain(
      "Builders Night",
    );
    expect(harness.attendanceCalls).toEqual(["read:org-1"]);
  });

  it("syncs the community's check-ins first when an organizer opens Overview", async () => {
    stubChain();
    renderOverview({ nearAccount: null, canOrganize: true });
    await screen.findByTestId("dashboard-node.attendance-event");
    expect(harness.attendanceCalls).toEqual(["reconcile:org-1", "read:org-1"]);
  });
});
