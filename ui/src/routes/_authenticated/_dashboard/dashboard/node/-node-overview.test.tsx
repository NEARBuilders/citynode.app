// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { Near } from "near-kit";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import { render } from "@/i18n/test-render";
import type { AuthRequestContext } from "@/lib/auth";
import { requireTeamArea } from "@/lib/team-workspace";
import { Route } from "./index";

const DAO = "example.sputnik-dao.near";
const POOL = "example.poolv1.near";

const harness = vi.hoisted(() => ({
  nearAccount: null as string | null,
  routeContext: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options,
    useRouteContext: () => harness.routeContext,
  }),
  Link: ({ children }: { children?: ReactNode }) => <a href="/dashboard">{children}</a>,
  redirect: (options: unknown) => ({ redirect: options }),
}));

vi.mock("@/app", () => ({
  buildTenantUrl: (label: string, gatewayId: string) => `https://${label}.${gatewayId}`,
  getActiveRuntime: () => ({ gatewayId: "citynode.app" }),
  useApiClient: () => ({
    auth: { getDao: async () => ({ daoAccountId: DAO, daoNetwork: "mainnet" }) },
    listDiscoveryActivities: async () => [],
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
    return Promise.resolve(null);
  });
}

function renderOverview({
  nearAccount,
  canManage = false,
  inFinanceTeam = false,
  network = "mainnet",
}: {
  nearAccount: string | null;
  canManage?: boolean;
  inFinanceTeam?: boolean;
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

  it("lets a Treasury-active member open the overview but not the other community pages", async () => {
    expect(await gate("/dashboard/node", "team-fin")).toBe("allowed");
    expect(await gate("/dashboard/node/proposals", "team-fin")).toBe("restricted:node-operations");
    expect(await gate("/nodes/node-1/content", "team-fin")).toBe("restricted:node-operations");
    expect(await gate("/tenant/tenant-1", "team-fin")).toBe("restricted:node-operations");
  });

  it("keeps the overview reachable with All areas or an Operations team active", async () => {
    expect(await gate("/dashboard/node", null)).toBe("allowed");
    expect(await gate("/dashboard/node", "team-ops")).toBe("allowed");
    expect(await gate("/dashboard/node/proposals", "team-ops")).toBe("allowed");
  });
});
