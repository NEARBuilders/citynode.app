// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Effect } from "effect";
import { Near } from "near-kit";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { englishAppMessages } from "@/i18n/catalogs";
import { render } from "@/i18n/test-render";
import type { StakePoolStatus } from "@/lib/queries/stake-pool";
import { teamPoolCall } from "@/lib/team-unstake";
import { canSeeTeamStake, TeamStakeCard, teamPoolPhase, teamPoolState } from "./team-stake-card";

const target = {
  teamAccountId: "india.sputnik-dao.near",
  poolAccountId: "india.poolv1.near",
  network: "mainnet" as const,
  protocol: "near",
};
const clients: QueryClient[] = [];
const PROPOSER = "itexpert120-contra.near";
const poolActionMocks = vi.hoisted(() => ({
  proposeTeamPoolAction: vi.fn(),
  nearAccount: "itexpert120-contra.near" as string | null,
  toastError: vi.fn(),
  connect: vi.fn(),
  verifyDaoAccount: vi.fn(),
  signAsDaoTransaction: vi.fn(),
  poolStatus: null as StakePoolStatus | Error | null,
}));
const realDateNow = Date.now;
const NEAR = 1_000_000_000_000_000_000_000_000n;
const PROPOSAL_PERIOD_NS = "604800000000000";

function stubChainTime(
  read: () => Promise<bigint> = async () => BigInt(realDateNow()) * 1_000_000n,
) {
  return vi.spyOn(Near.prototype, "rpc", "get").mockReturnValue({
    getBlock: async () => ({ header: { timestamp_nanosec: (await read()).toString() } }),
  } as never);
}

beforeEach(() => {
  stubChainTime();
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: poolActionMocks.toastError },
}));
vi.mock("@/lib/use-near-account", () => ({
  useNearAccount: () => poolActionMocks.nearAccount,
}));
vi.mock("@/app", () => ({
  useAuthClient: () => ({
    near: { getNearClient: () => new Near({ network: "mainnet" }) },
  }),
}));

vi.mock("@/lib/dao-connect", () => ({
  useDaoConnection: () => ({
    status: "idle",
    daoAccountId: null,
    error: null,
    connect: poolActionMocks.connect,
    disconnect: vi.fn(),
  }),
  useDaoAutoRestore: () => undefined,
  verifyDaoAccount: poolActionMocks.verifyDaoAccount,
  signAsDaoTransaction: poolActionMocks.signAsDaoTransaction,
  describeDaoError: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

function earningPool(overrides: Partial<StakePoolStatus> = {}): StakePoolStatus {
  return {
    ownerId: target.teamAccountId,
    feeNumerator: 100,
    feeDenominator: 100,
    stakingPaused: false,
    validatorSet: "current",
    ...overrides,
  };
}

vi.mock("@/lib/queries/stake-pool", async () => {
  const actual = await vi.importActual<typeof import("@/lib/queries/stake-pool")>(
    "@/lib/queries/stake-pool",
  );
  return {
    ...actual,
    stakePoolStatusQueryOptions: (
      options: Parameters<typeof actual.stakePoolStatusQueryOptions>[0],
    ) => ({
      ...actual.stakePoolStatusQueryOptions(options),
      queryFn: async () => {
        const status = poolActionMocks.poolStatus ?? earningPool();
        if (status instanceof Error) throw status;
        return status;
      },
    }),
  };
});

vi.mock("@/lib/team-unstake", async () => {
  const actual = await vi.importActual<typeof import("@/lib/team-unstake")>("@/lib/team-unstake");
  return {
    ...actual,
    proposeTeamPoolAction: poolActionMocks.proposeTeamPoolAction,
  };
});

afterEach(() => {
  cleanup();
  poolActionMocks.proposeTeamPoolAction.mockReset();
  poolActionMocks.toastError.mockReset();
  poolActionMocks.connect.mockReset();
  poolActionMocks.verifyDaoAccount.mockReset();
  poolActionMocks.signAsDaoTransaction.mockReset();
  poolActionMocks.nearAccount = PROPOSER;
  poolActionMocks.poolStatus = null;
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderCard(props: Partial<Parameters<typeof TeamStakeCard>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const view = render(
    <QueryClientProvider client={client}>
      <TeamStakeCard target={target} {...props} />
    </QueryClientProvider>,
  );
  return { client, ...view };
}

const actionButton = () =>
  screen.getByTestId("dashboard-node.team-stake-unstake") as HTMLButtonElement;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

function teamAccount({
  staked = (5n * NEAR) / 2n,
  unstaked = 0n,
  canWithdraw = true,
}: {
  staked?: bigint;
  unstaked?: bigint;
  canWithdraw?: boolean;
} = {}) {
  return {
    account_id: target.teamAccountId,
    staked_balance: staked.toString(),
    unstaked_balance: unstaked.toString(),
    can_withdraw: canWithdraw,
  };
}

function poolProposal(
  overrides: { id?: number; method?: string; status?: string; submittedMs?: number } = {},
) {
  return {
    id: overrides.id ?? 7,
    proposer: "requestor.near",
    description: "",
    kind: {
      FunctionCall: {
        receiver_id: target.poolAccountId,
        actions: [{ method_name: overrides.method ?? "unstake", args: "", deposit: "0", gas: "0" }],
      },
    },
    status: overrides.status ?? "InProgress",
    vote_counts: {},
    votes: {},
    submission_time: (BigInt(overrides.submittedMs ?? Date.now()) * 1_000_000n).toString(),
  };
}

type PoolProposal = ReturnType<typeof poolProposal>;

const proposerPolicy = {
  roles: [
    {
      name: "Requestor",
      kind: { Group: [PROPOSER] },
      permissions: ["call:AddProposal", "transfer:AddProposal"],
    },
    {
      name: "Approver",
      kind: { Group: ["approver.near"] },
      permissions: ["call:VoteApprove", "call:VoteReject"],
    },
  ],
  proposal_period: PROPOSAL_PERIOD_NS,
};

function holderPolicy(amount: string, otherRoles: typeof proposerPolicy.roles = []) {
  return {
    roles: [
      { name: "Holders", kind: { Member: amount }, permissions: ["call:AddProposal"] },
      ...otherRoles,
    ],
    proposal_period: PROPOSAL_PERIOD_NS,
  };
}

function stubChain(
  account: Record<string, unknown>,
  proposals: PoolProposal[] | Error,
  policy: Record<string, unknown> | Error | null = proposerPolicy,
  delegation: string | Error = "0",
) {
  return vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method, args) => {
    if (method === "get_account") return Promise.resolve({ ...account });
    if (method === "delegation_balance_of")
      return delegation instanceof Error ? Promise.reject(delegation) : Promise.resolve(delegation);
    if (method === "get_total_staked_balance")
      return Promise.resolve("999000000000000000000000000");
    if (method === "get_policy")
      return policy instanceof Error ? Promise.reject(policy) : Promise.resolve(policy);
    if (proposals instanceof Error) return Promise.reject(proposals);
    if (method === "get_last_proposal_id")
      return Promise.resolve(Math.max(0, ...proposals.map((proposal) => proposal.id + 1)));
    if (method === "get_proposals") {
      const { from_index, limit } = args as { from_index: number; limit: number };
      return Promise.resolve(
        proposals.filter(
          (proposal) => proposal.id >= from_index && proposal.id < from_index + limit,
        ),
      );
    }
    return Promise.resolve(null);
  });
}

describe("teamPoolPhase", () => {
  const view = (staked: bigint, unstaked: bigint, canWithdraw: boolean) => ({
    accountId: target.teamAccountId,
    stakedBalance: staked,
    unstakedBalance: unstaked,
    canWithdraw,
  });

  it("offers a claim only when nothing is unstaked", () => {
    expect(teamPoolPhase(view(2n * NEAR, 0n, true), false)).toBe("unstake");
  });

  it("never offers a claim while earlier rewards are unlocking", () => {
    expect(teamPoolPhase(view(2n * NEAR, NEAR, false), false)).toBe("pending-release");
  });

  it("offers the move before another claim once unlocked", () => {
    expect(teamPoolPhase(view(2n * NEAR, NEAR, true), false)).toBe("withdraw");
  });

  it("waits while an unstake or withdraw proposal is open", () => {
    expect(teamPoolPhase(view(2n * NEAR, 0n, true), true)).toBe("proposal-pending");
  });

  it("has nothing to offer without a pool account view", () => {
    expect(teamPoolPhase(undefined, false)).toBeNull();
  });
});

describe("canSeeTeamStake", () => {
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
        permissions: ["call:VoteApprove", "call:VoteReject", "call:Finalize"],
      },
      {
        name: "Admin",
        kind: { Group: ["admin.near"] },
        permissions: ["policy:*", "config:*"],
      },
    ],
  };
  const visible = (overrides: Partial<Parameters<typeof canSeeTeamStake>[0]>) =>
    canSeeTeamStake({
      canManage: false,
      inFinanceTeam: false,
      policy,
      accountId: "member.near",
      ...overrides,
    });

  it("shows the card to owners, admins and the Treasury team", () => {
    expect(visible({ canManage: true })).toBe(true);
    expect(visible({ inFinanceTeam: true })).toBe(true);
  });

  it("shows the card to accounts that can propose or approve in the DAO", () => {
    expect(visible({ accountId: "requestor.near" })).toBe(true);
    expect(visible({ accountId: "approver.near" })).toBe(true);
  });

  it("hides the card from plain members and from DAO roles without money permissions", () => {
    expect(visible({})).toBe(false);
    expect(visible({ accountId: "admin.near" })).toBe(false);
    expect(visible({ accountId: null })).toBe(false);
    expect(visible({ policy: null, accountId: "requestor.near" })).toBe(false);
  });

  it("shows the card through a Sputnik Member role by delegated balance", () => {
    const memberPolicy = (amount: string) => ({
      roles: [{ name: "Holders", kind: { Member: amount }, permissions: ["call:VoteApprove"] }],
    });
    expect(visible({ policy: memberPolicy("0") })).toBe(true);
    expect(visible({ policy: memberPolicy("100"), delegationBalance: 100n })).toBe(true);
    expect(visible({ policy: memberPolicy("100"), delegationBalance: 99n })).toBe(false);
    expect(visible({ policy: memberPolicy("100") })).toBe(false);
  });

  it("shows the card to signed-in accounts when the DAO policy can't be read", () => {
    expect(visible({ policy: undefined, policyUnreadable: true })).toBe(true);
    expect(visible({ policy: undefined, policyUnreadable: true, accountId: null })).toBe(false);
  });
});

describe("TeamStakeCard", () => {
  it("shows the team account's staked balance, not the pool total", async () => {
    stubChain(teamAccount(), [], null);
    renderCard();
    expect(await screen.findByText("2.5 NEAR")).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("2.5 NEAR");
    expect(screen.queryByText("999 NEAR")).toBeNull();
    expect(screen.getByText(/india\.sputnik-dao\.near/)).toBeTruthy();
    expect(screen.getByText(/india\.poolv1\.near/)).toBeTruthy();
  });

  it("explains when the team account or staking pool is missing", () => {
    renderCard({ target: null });
    expect(screen.getByTestId("dashboard-node.team-stake")).toBeTruthy();
    expect(screen.getByText("Link a team treasury to see its stake here.")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-node.team-stake-amount")).toBeNull();
    expect(screen.queryByTestId("dashboard-node.team-stake-unstake")).toBeNull();
  });

  it("keeps the amount unavailable when the pool account view fails", async () => {
    vi.spyOn(Near.prototype, "view").mockRejectedValue(new Error("Unavailable"));
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("—"),
    );
  });

  it("proposes an unstake of some team stake without an attached deposit", async () => {
    stubChain(teamAccount(), []);
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    renderCard();
    const unstake = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((unstake as HTMLButtonElement).disabled).toBe(false));
    expect(unstake.textContent).toBe("Propose unstake");
    fireEvent.click(unstake);
    const amount = await screen.findByTestId("dashboard-node.team-stake-unstake-amount");
    fireEvent.change(amount, { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("dashboard-node.team-stake-unstake-confirm"));
    await waitFor(() =>
      expect(poolActionMocks.proposeTeamPoolAction).toHaveBeenCalledWith(
        expect.objectContaining({
          teamAccountId: "india.sputnik-dao.near",
          poolAccountId: "india.poolv1.near",
          method: "unstake",
          amountYocto: 1_000_000_000_000_000_000_000_000n,
        }),
      ),
    );
  });

  it("disables the action while unstaked NEAR is locked in the epoch window", async () => {
    stubChain(
      teamAccount({ staked: 0n, unstaked: (3n * NEAR) / 2n, canWithdraw: false }),
      [],
      null,
    );
    renderCard();
    const unstake = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((unstake as HTMLButtonElement).disabled).toBe(true));
    expect(await screen.findByTestId("dashboard-node.team-stake-pending-release")).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("1.5 NEAR");
  });

  it("proposes a withdraw once the epoch window has passed", async () => {
    stubChain(teamAccount({ staked: 0n, unstaked: (3n * NEAR) / 2n }), []);
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    renderCard();
    const withdraw = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((withdraw as HTMLButtonElement).disabled).toBe(false));
    expect(withdraw.textContent).toBe("Propose withdraw");
    fireEvent.click(withdraw);
    await screen.findByTestId("dashboard-node.team-stake-unstake-confirm");
    fireEvent.click(screen.getByTestId("dashboard-node.team-stake-unstake-confirm"));
    await waitFor(() =>
      expect(poolActionMocks.proposeTeamPoolAction).toHaveBeenCalledWith(
        expect.objectContaining({
          teamAccountId: "india.sputnik-dao.near",
          poolAccountId: "india.poolv1.near",
          method: "withdraw",
          amountYocto: 1_500_000_000_000_000_000_000_000n,
        }),
      ),
    );
  });

  it("fills the unstake amount with max minus 1 NEAR, by default and on Max", async () => {
    stubChain(teamAccount(), []);
    renderCard();
    const unstake = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((unstake as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(unstake);
    const amount = (await screen.findByTestId(
      "dashboard-node.team-stake-unstake-amount",
    )) as HTMLInputElement;
    expect(amount.value).toBe("1.5");
    fireEvent.change(amount, { target: { value: "0" } });
    fireEvent.click(screen.getByText("Max"));
    expect(amount.value).toBe("1.5");
  });

  it("fills the full withdrawable amount, by default and on Max", async () => {
    stubChain(teamAccount({ unstaked: (3n * NEAR) / 2n }), []);
    renderCard();
    const withdraw = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((withdraw as HTMLButtonElement).disabled).toBe(false));
    expect(withdraw.textContent).toBe("Propose withdraw");
    fireEvent.click(withdraw);
    const amount = (await screen.findByTestId(
      "dashboard-node.team-stake-unstake-amount",
    )) as HTMLInputElement;
    expect(amount.value).toBe("1.5");
    fireEvent.change(amount, { target: { value: "0" } });
    fireEvent.click(screen.getByText("Max"));
    expect(amount.value).toBe("1.5");
  });

  it("disables claiming while earlier rewards are unlocking, even with new rewards staked", async () => {
    stubChain(teamAccount({ staked: 54n * NEAR, unstaked: 300n * NEAR, canWithdraw: false }), []);
    renderCard();
    const action = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await screen.findByTestId("dashboard-node.team-stake-pending-release");
    expect((action as HTMLButtonElement).disabled).toBe(true);
  });

  it("waits for an open claim proposal, including ones made in Trezu", async () => {
    stubChain(teamAccount(), [poolProposal()]);
    renderCard();
    const pending = await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    expect(pending.querySelector("a")?.getAttribute("href")).toBe(
      `https://trezu.app/${target.teamAccountId}/requests`,
    );
    expect(actionButton().disabled).toBe(true);
  });

  it.each([
    "unstake_all",
    "withdraw_all",
  ])("waits for an open %s proposal on the pool", async (method) => {
    stubChain(teamAccount(), [poolProposal({ method })]);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    expect(actionButton().disabled).toBe(true);
  });

  it.each([
    false,
    true,
  ])("shows the unstaked balance while a proposal is open and rewards are unstaked (withdrawable: %s)", async (canWithdraw) => {
    stubChain(teamAccount({ staked: 54n * NEAR, unstaked: 300n * NEAR, canWithdraw }), [
      poolProposal({ method: "withdraw_all" }),
    ]);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    expect(screen.getByText("Unstaked")).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("300 NEAR");
  });

  it("shows the staked balance while a proposal is open and nothing is unstaked", async () => {
    stubChain(teamAccount({ staked: 54n * NEAR }), [poolProposal({ method: "unstake_all" })]);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    expect(screen.getByText("Staked")).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("54 NEAR");
  });

  it("ignores claim proposals past the DAO's proposal period", async () => {
    stubChain(teamAccount(), [poolProposal({ submittedMs: Date.now() - 8 * 24 * 60 * 60 * 1000 })]);
    renderCard();
    const action = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((action as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByTestId("dashboard-node.team-stake-proposal-pending")).toBeNull();
  });

  it("finds an open claim proposal older than the newest 25", async () => {
    const recentMs = Date.now() - 60 * 60 * 1000;
    const proposals = Array.from({ length: 60 }, (_, id) =>
      poolProposal({
        id,
        status: id === 12 ? "InProgress" : "Approved",
        submittedMs: recentMs + id * 1000,
      }),
    );
    stubChain(teamAccount(), proposals);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    expect(actionButton().disabled).toBe(true);
  });

  it("pauses actions when only the staking pool can't be read", async () => {
    vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method) => {
      if (method === "get_account" || method === "get_total_staked_balance")
        return Promise.reject(new Error("RPC unavailable"));
      if (method === "get_policy") return Promise.resolve(proposerPolicy);
      if (method === "get_last_proposal_id") return Promise.resolve(0);
      if (method === "get_proposals") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-read-failed");
    expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("—");
    expect(actionButton().disabled).toBe(true);
  });

  it("pauses actions when the DAO's policy can't be read", async () => {
    stubChain(teamAccount(), [], new Error("RPC unavailable"));
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-read-failed");
    expect(actionButton().disabled).toBe(true);
  });

  it("pauses actions when the DAO's proposals can't be read", async () => {
    stubChain(teamAccount(), new Error("RPC unavailable"));
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-read-failed");
    expect(actionButton().disabled).toBe(true);
  });

  it("keeps actions disabled while the DAO's proposals are still being read", async () => {
    const view = vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method) => {
      if (method === "get_account") return Promise.resolve(teamAccount());
      if (method === "get_total_staked_balance")
        return Promise.resolve("999000000000000000000000000");
      if (method === "get_policy") return Promise.resolve(proposerPolicy);
      if (method === "get_last_proposal_id") return new Promise(() => {});
      return Promise.resolve(null);
    });
    renderCard();
    await waitFor(() =>
      expect(view.mock.calls.some(([, method]) => method === "get_last_proposal_id")).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(actionButton().disabled).toBe(true);
  });

  it("pauses actions when a later read of the DAO's policy fails, and retries it", async () => {
    let policyFails = false;
    vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method) => {
      if (method === "get_account") return Promise.resolve(teamAccount());
      if (method === "get_total_staked_balance")
        return Promise.resolve("999000000000000000000000000");
      if (method === "get_policy")
        return policyFails
          ? Promise.reject(new Error("RPC unavailable"))
          : Promise.resolve(proposerPolicy);
      if (method === "get_last_proposal_id") return Promise.resolve(0);
      if (method === "get_proposals") return Promise.resolve([]);
      return Promise.resolve(null);
    });
    const { client } = renderCard();
    const action = (await screen.findByTestId(
      "dashboard-node.team-stake-unstake",
    )) as HTMLButtonElement;
    await waitFor(() => expect(action.disabled).toBe(false));
    policyFails = true;
    await client.refetchQueries({ queryKey: ["team-pool-policy"] });
    const failed = await screen.findByTestId("dashboard-node.team-stake-read-failed");
    expect(action.disabled).toBe(true);
    policyFails = false;
    fireEvent.click(failed.querySelector("button") as HTMLButtonElement);
    await waitFor(() => expect(action.disabled).toBe(false));
  });

  it("closes the dialog without proposing when an open unstake proposal appears", async () => {
    const proposals: PoolProposal[] = [];
    stubChain(teamAccount(), proposals);
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    const { client } = renderCard();
    const action = (await screen.findByTestId(
      "dashboard-node.team-stake-unstake",
    )) as HTMLButtonElement;
    await waitFor(() => expect(action.disabled).toBe(false));
    fireEvent.click(action);
    const confirm = await screen.findByTestId("dashboard-node.team-stake-unstake-confirm");
    proposals.push(poolProposal());
    await client.refetchQueries({ queryKey: ["team-pool-proposals"] });
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(screen.queryByTestId("dashboard-node.team-stake-unstake-confirm")).toBeNull(),
    );
    expect(poolActionMocks.proposeTeamPoolAction).not.toHaveBeenCalled();
  });

  it.each([
    ["a Finance member or owner whose account has no DAO role", "member.near"],
    ["an account that can only approve", "approver.near"],
    ["someone without a NEAR account", null],
  ])("disables actions for %s and explains who can start them", async (_who, account) => {
    poolActionMocks.nearAccount = account;
    stubChain(teamAccount(), []);
    renderCard();
    const note = await screen.findByTestId("dashboard-node.team-stake-proposers-only");
    expect(note.querySelector("a")?.getAttribute("href")).toBe(
      `https://trezu.app/${target.teamAccountId}/requests`,
    );
    expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("2.5 NEAR");
    expect(actionButton().disabled).toBe(true);
  });

  it("enables actions for an account the DAO lets propose", async () => {
    stubChain(teamAccount({ staked: 0n, unstaked: (3n * NEAR) / 2n }), []);
    renderCard();
    const action = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((action as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByTestId("dashboard-node.team-stake-proposers-only")).toBeNull();
  });

  it("pauses actions on a testnet DAO, even for an account that could propose", async () => {
    const view = stubChain(teamAccount(), []);
    renderCard({ target: { ...target, network: "testnet" } });
    await screen.findByText("2.5 NEAR");
    expect(screen.getByTestId("dashboard-node.team-stake-rules-unreadable")).toBeTruthy();
    expect(actionButton().disabled).toBe(true);
    expect(screen.queryByTestId("dashboard-node.team-stake-proposers-only")).toBeNull();
    expect(view.mock.calls.some(([, method]) => method === "get_policy")).toBe(false);
  });

  it("does not add the role note while the pool is paused or waiting", async () => {
    poolActionMocks.nearAccount = "member.near";
    stubChain(teamAccount(), [poolProposal()]);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    expect(screen.queryByTestId("dashboard-node.team-stake-proposers-only")).toBeNull();
  });
});

describe("TeamStakeCard chain-state safety", () => {
  const stakedOnly = () => teamAccount({ staked: 10n * NEAR });
  const memberPolicy = (amount: string) => holderPolicy(amount, proposerPolicy.roles.slice(1));

  async function openUnstakeDialog() {
    await waitFor(() => expect(actionButton().disabled).toBe(false));
    fireEvent.click(actionButton());
    return (await screen.findByTestId(
      "dashboard-node.team-stake-unstake-confirm",
    )) as HTMLButtonElement;
  }

  it("re-reads the pool after a proposal executes before offering another action", async () => {
    const account = stakedOnly();
    const proposals = [poolProposal()];
    const view = stubChain(account, proposals);
    const base = view.getMockImplementation();
    let releasePool = () => {};
    let holdPool = false;
    view.mockImplementation((contractId, method, args) => {
      if (holdPool && method === "get_account")
        return new Promise((resolve) => {
          releasePool = () => resolve({ ...account });
        });
      return base?.(contractId, method, args) as Promise<never>;
    });
    const { client } = renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    account.unstaked_balance = (3n * NEAR).toString();
    account.can_withdraw = false;
    proposals[0].status = "Approved";
    holdPool = true;
    await client.refetchQueries({ queryKey: ["team-pool-proposals"] });
    await waitFor(() =>
      expect(screen.queryByTestId("dashboard-node.team-stake-proposal-pending")).toBeNull(),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(actionButton().disabled).toBe(true);
    releasePool();
    await screen.findByTestId("dashboard-node.team-stake-pending-release");
    expect(actionButton().disabled).toBe(true);
  });

  it.each([
    ["get_account", ["stake-pool"]],
    ["get_policy", ["team-pool-policy"]],
    ["get_last_proposal_id", ["team-pool-proposals"]],
  ])("refuses confirmation while %s is re-read in the background", async (read, queryKey) => {
    let hold = false;
    const view = stubChain(stakedOnly(), []);
    const base = view.getMockImplementation();
    view.mockImplementation((contractId, method, args) =>
      hold && method === read
        ? new Promise(() => {})
        : (base?.(contractId, method, args) as Promise<never>),
    );
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    const { client } = renderCard();
    const confirm = await openUnstakeDialog();
    hold = true;
    void client.refetchQueries({ queryKey });
    await waitFor(() => expect(client.isFetching({ queryKey })).toBeGreaterThan(0));
    await waitFor(() => expect(confirm.disabled).toBe(true));
    fireEvent.click(confirm);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(actionButton().disabled).toBe(true);
    expect(poolActionMocks.proposeTeamPoolAction).not.toHaveBeenCalled();
  });

  type SubmitChain = {
    account: ReturnType<typeof teamAccount>;
    proposals: PoolProposal[];
    policy: typeof proposerPolicy;
  };

  it.each([
    [
      "earlier rewards start unlocking",
      (chain: SubmitChain) => {
        chain.account.unstaked_balance = NEAR.toString();
        chain.account.can_withdraw = false;
      },
      englishAppMessages["stake.unlockNotice"],
    ],
    [
      "an unstake proposal is opened elsewhere",
      (chain: SubmitChain) => {
        chain.proposals.push(poolProposal());
      },
      "An unstake or withdraw proposal is waiting for votes in the DAO.",
    ],
    [
      "the staked balance drops below the amount",
      (chain: SubmitChain) => {
        chain.account.staked_balance = NEAR.toString();
      },
      "Enter an amount within the available team unstake balance.",
    ],
    [
      "the account loses its proposer role",
      (chain: SubmitChain) => {
        chain.policy.roles.splice(0, 1);
      },
      "Only DAO members who can propose can start this.",
    ],
  ])("re-reads the chain at submit and stops when %s", async (_change, mutate, message) => {
    const chain: SubmitChain = {
      account: stakedOnly(),
      proposals: [],
      policy: structuredClone(proposerPolicy),
    };
    stubChain(chain.account, chain.proposals, chain.policy);
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    renderCard();
    const confirm = await openUnstakeDialog();
    fireEvent.change(screen.getByTestId("dashboard-node.team-stake-unstake-amount"), {
      target: { value: "5" },
    });
    mutate(chain);
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(screen.queryByTestId("dashboard-node.team-stake-unstake-confirm")).toBeNull(),
    );
    expect(poolActionMocks.proposeTeamPoolAction).not.toHaveBeenCalled();
    expect(poolActionMocks.toastError).toHaveBeenCalledWith(message);
  });

  it("counts a proposal still live on chain when the browser clock runs ahead", async () => {
    const chainNowMs = realDateNow();
    vi.spyOn(Date, "now").mockImplementation(() => realDateNow() + 120_000);
    stubChain(stakedOnly(), [
      poolProposal({ submittedMs: chainNowMs - 7 * 24 * 60 * 60 * 1000 + 60_000 }),
    ]);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    expect(actionButton().disabled).toBe(true);
  });

  it("pauses actions when the chain's time can't be read", async () => {
    stubChainTime(() => Promise.reject(new Error("RPC unavailable")));
    stubChain(stakedOnly(), []);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-read-failed");
    expect(actionButton().disabled).toBe(true);
  });

  it.each([
    { when: "within", ageMs: 60_000, open: true },
    { when: "after", ageMs: 8 * 24 * 60 * 60 * 1000, open: false },
  ])("treats a failed claim proposal $when the proposal period as open: $open", async ({
    ageMs,
    open,
  }) => {
    stubChain(stakedOnly(), [poolProposal({ status: "Failed", submittedMs: Date.now() - ageMs })]);
    renderCard();
    if (open) {
      await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
      expect(actionButton().disabled).toBe(true);
    } else {
      await waitFor(() => expect(actionButton().disabled).toBe(false));
      expect(screen.queryByTestId("dashboard-node.team-stake-proposal-pending")).toBeNull();
    }
  });

  it("enables actions through a Member role with no minimum", async () => {
    stubChain(stakedOnly(), [], memberPolicy("0"));
    renderCard();
    await waitFor(() => expect(actionButton().disabled).toBe(false));
  });

  it("enables actions through a Member role when the delegation balance meets it", async () => {
    stubChain(stakedOnly(), [], memberPolicy("100"), "100");
    renderCard();
    await waitFor(() => expect(actionButton().disabled).toBe(false));
  });

  it("disables actions through a Member role when the delegation balance falls short", async () => {
    const view = stubChain(stakedOnly(), [], memberPolicy("100"), "99");
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposers-only");
    expect(actionButton().disabled).toBe(true);
    expect(view.mock.calls.some(([, method]) => method === "delegation_balance_of")).toBe(true);
  });

  it("pauses actions when a Member role's delegation balance can't be read", async () => {
    stubChain(stakedOnly(), [], memberPolicy("100"), new Error("RPC unavailable"));
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-read-failed");
    expect(actionButton().disabled).toBe(true);
    expect(screen.queryByTestId("dashboard-node.team-stake-proposers-only")).toBeNull();
  });

  it.each([
    "unstake",
    "unstake_all",
    "withdraw",
  ])("offers an unstake while an approved %s proposal is within its period", async (method) => {
    stubChain(stakedOnly(), [poolProposal({ method, status: "Approved" })]);
    renderCard();
    await waitFor(() => expect(actionButton().disabled).toBe(false));
    expect(actionButton().textContent).toBe("Propose unstake");
  });
});

describe("TeamStakeCard check before signing", () => {
  async function proposeThroughTrezu(
    onConnect: (card: { proposals: PoolProposal[]; unmount: () => void }) => void,
  ) {
    const { proposeTeamPoolAction } =
      await vi.importActual<typeof import("@/lib/team-unstake")>("@/lib/team-unstake");
    poolActionMocks.proposeTeamPoolAction.mockImplementation(proposeTeamPoolAction);
    poolActionMocks.verifyDaoAccount.mockResolvedValue(false);
    poolActionMocks.signAsDaoTransaction.mockResolvedValue({});
    const proposals: PoolProposal[] = [];
    stubChain(teamAccount({ staked: 10n * NEAR }), proposals);
    const { unmount } = renderCard();
    poolActionMocks.connect.mockImplementation(async () => {
      onConnect({ proposals, unmount });
      return target.teamAccountId;
    });
    await waitFor(() => expect(actionButton().disabled).toBe(false));
    fireEvent.click(actionButton());
    fireEvent.change(await screen.findByTestId("dashboard-node.team-stake-unstake-amount"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByTestId("dashboard-node.team-stake-unstake-confirm"));
    await waitFor(() => expect(poolActionMocks.connect).toHaveBeenCalledTimes(1));
  }

  it("never signs when an unstake proposal opens while Trezu connects", async () => {
    await proposeThroughTrezu(({ proposals }) => {
      proposals.push(poolProposal());
    });
    await waitFor(() =>
      expect(poolActionMocks.toastError).toHaveBeenCalledWith(
        "An unstake or withdraw proposal is waiting for votes in the DAO.",
      ),
    );
    expect(poolActionMocks.signAsDaoTransaction).not.toHaveBeenCalled();
    expect(screen.queryByTestId("dashboard-node.team-stake-unstake-confirm")).toBeNull();
  });

  it.each([
    [
      "cancelled",
      () => {
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      },
    ],
    ["unmounted", ({ unmount }: { unmount: () => void }) => unmount()],
  ])("never signs when the card is %s while Trezu connects", async (_change, change) => {
    await proposeThroughTrezu(change);
    await settle();
    expect(poolActionMocks.signAsDaoTransaction).not.toHaveBeenCalled();
    expect(poolActionMocks.toastError).not.toHaveBeenCalled();
  });

  it.each([
    [
      "cancelled",
      () => {
        fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      },
    ],
    ["unmounted", ({ unmount }: { unmount: () => void }) => unmount()],
  ])("finishes signing when the card is %s while the wallet prompt is open", async (_change, change) => {
    let finishSigning = () => {};
    let card: { proposals: PoolProposal[]; unmount: () => void } | null = null;
    await proposeThroughTrezu((connected) => {
      card = connected;
      poolActionMocks.signAsDaoTransaction.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishSigning = () => resolve({});
          }),
      );
    });
    await waitFor(() => expect(poolActionMocks.signAsDaoTransaction).toHaveBeenCalledTimes(1));
    if (card) change(card);
    finishSigning();
    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Unstake proposed", expect.anything()),
    );
    expect(poolActionMocks.signAsDaoTransaction).toHaveBeenCalledTimes(1);
    expect(poolActionMocks.toastError).not.toHaveBeenCalled();
  });

  it("shows an error when proposing fails unexpectedly", async () => {
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.die(new Error("Unexpected")));
    stubChain(teamAccount({ staked: 10n * NEAR }), []);
    renderCard();
    await waitFor(() => expect(actionButton().disabled).toBe(false));
    fireEvent.click(actionButton());
    fireEvent.change(await screen.findByTestId("dashboard-node.team-stake-unstake-amount"), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByTestId("dashboard-node.team-stake-unstake-confirm"));
    await waitFor(() => expect(poolActionMocks.toastError).toHaveBeenCalledWith("Unexpected"));
  });

  it("signs after Trezu connects when nothing changed", async () => {
    await proposeThroughTrezu(() => {});
    await waitFor(() =>
      expect(poolActionMocks.signAsDaoTransaction).toHaveBeenCalledWith(
        target.teamAccountId,
        teamPoolCall(target.poolAccountId, "unstake", 5n * NEAR),
      ),
    );
    expect(poolActionMocks.toastError).not.toHaveBeenCalled();
  });
});

describe("TeamStakeCard superseded submissions", () => {
  function liveChain(policy: { roles: unknown[]; proposal_period: string }, delegation = "100") {
    const chain = {
      account: teamAccount({ staked: 10n * NEAR }),
      policy,
      proposals: [] as PoolProposal[],
      held: null as string | null,
      waiting: false,
      release: () => {},
    };
    vi.spyOn(Near.prototype, "view").mockImplementation(async (_contractId, method, args) => {
      const answer = (): unknown => {
        if (method === "get_account") return structuredClone(chain.account);
        if (method === "get_policy") return structuredClone(chain.policy);
        if (method === "delegation_balance_of") return delegation;
        if (method === "get_last_proposal_id")
          return Math.max(0, ...chain.proposals.map((proposal) => proposal.id + 1));
        if (method === "get_proposals") {
          const { from_index, limit } = args as { from_index: number; limit: number };
          return structuredClone(
            chain.proposals.filter(
              (proposal) => proposal.id >= from_index && proposal.id < from_index + limit,
            ),
          );
        }
        return null;
      };
      if (method !== chain.held) return answer();
      chain.held = null;
      chain.waiting = true;
      return new Promise((resolve) => {
        chain.release = () => resolve(answer());
      });
    });
    return chain;
  }

  async function confirmHeld(chain: ReturnType<typeof liveChain>, method: string) {
    await waitFor(() => expect(actionButton().disabled).toBe(false));
    fireEvent.click(actionButton());
    const confirm = await screen.findByTestId("dashboard-node.team-stake-unstake-confirm");
    chain.held = method;
    fireEvent.click(confirm);
    await waitFor(() => expect(chain.waiting).toBe(true));
  }

  const memberPolicy = () => holderPolicy("100");

  it.each([
    [
      "an unstake proposal opens",
      ["team-pool-proposals"],
      (chain: ReturnType<typeof liveChain>) => {
        chain.proposals.push(poolProposal());
      },
    ],
    [
      "earlier rewards start unlocking",
      ["stake-pool"],
      (chain: ReturnType<typeof liveChain>) => {
        chain.account.unstaked_balance = NEAR.toString();
        chain.account.can_withdraw = false;
      },
    ],
    [
      "the account loses its proposer role",
      ["team-pool-policy"],
      (chain: ReturnType<typeof liveChain>) => {
        chain.policy.roles = [];
      },
    ],
    [
      "the staked balance drops below the amount",
      ["stake-pool"],
      (chain: ReturnType<typeof liveChain>) => {
        chain.account.staked_balance = NEAR.toString();
      },
    ],
  ])("never proposes from a read made before %s arrived", async (_change, queryKey, mutate) => {
    const chain = liveChain(memberPolicy());
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    const { client } = renderCard();
    await confirmHeld(chain, "delegation_balance_of");
    mutate(chain);
    await client.refetchQueries({ queryKey });
    await settle();
    chain.release();
    await settle();
    expect(poolActionMocks.proposeTeamPoolAction).not.toHaveBeenCalled();
  });

  it("never proposes after the card unmounts during the read at submit", async () => {
    const chain = liveChain(memberPolicy());
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    const { unmount } = renderCard();
    await confirmHeld(chain, "delegation_balance_of");
    unmount();
    chain.release();
    await settle();
    expect(poolActionMocks.proposeTeamPoolAction).not.toHaveBeenCalled();
  });

  it.each([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  ])("never proposes from a read superseded %i microtasks after it ends", async (depth) => {
    const chain = liveChain(memberPolicy());
    const view = vi.spyOn(Near.prototype, "view");
    const reads = () =>
      view.mock.calls.filter(([, method]) => method === "delegation_balance_of").length;
    let readsAtUpdate: number | null = null;
    let readsBetweenUpdateAndPropose: number | null = null;
    poolActionMocks.proposeTeamPoolAction.mockImplementation(() => {
      if (readsAtUpdate !== null) readsBetweenUpdateAndPropose = reads() - readsAtUpdate;
      return Effect.void;
    });
    const { client } = renderCard();
    await confirmHeld(chain, "delegation_balance_of");
    const update = (remaining: number) => {
      if (remaining > 0) {
        queueMicrotask(() => update(remaining - 1));
        return;
      }
      readsAtUpdate = reads();
      client.setQueryData(["team-pool-policy", target.teamAccountId], memberPolicy());
    };
    await act(async () => {
      chain.release();
      update(depth);
    });
    await settle();
    expect(readsBetweenUpdateAndPropose ?? 1).toBeGreaterThan(0);
  });

  it("never proposes after the dialog is cancelled during the read at submit", async () => {
    const chain = liveChain(memberPolicy());
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    renderCard();
    await confirmHeld(chain, "delegation_balance_of");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByTestId("dashboard-node.team-stake-unstake-confirm")).toBeNull(),
    );
    chain.release();
    await settle();
    expect(poolActionMocks.proposeTeamPoolAction).not.toHaveBeenCalled();
  });

  it("never proposes after the signed-in NEAR account changes during the read at submit", async () => {
    const chain = liveChain({
      roles: [
        {
          name: "Requestor",
          kind: { Group: [PROPOSER, "other-proposer.near"] },
          permissions: ["call:AddProposal"],
        },
      ],
      proposal_period: PROPOSAL_PERIOD_NS,
    });
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    const { client, rerender } = renderCard();
    await confirmHeld(chain, "get_account");
    poolActionMocks.nearAccount = "other-proposer.near";
    rerender(
      <QueryClientProvider client={client}>
        <TeamStakeCard target={target} />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("dashboard-node.team-stake-unstake-confirm")).toBeNull(),
    );
    chain.release();
    await settle();
    expect(poolActionMocks.proposeTeamPoolAction).not.toHaveBeenCalled();
  });

  it("still stops a read at submit when a poll during it brings new pool data", async () => {
    const chain = liveChain(memberPolicy());
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    const { client } = renderCard();
    await confirmHeld(chain, "delegation_balance_of");
    chain.account.staked_balance = NEAR.toString();
    await client.refetchQueries({ queryKey: ["team-pool-proposals"] });
    await settle();
    chain.release();
    await waitFor(() =>
      expect(poolActionMocks.toastError).toHaveBeenCalledWith(
        "Enter an amount within the available team unstake balance.",
      ),
    );
    expect(poolActionMocks.proposeTeamPoolAction).not.toHaveBeenCalled();
  });

  it("proposes when one background poll lands during a slow read at submit", async () => {
    const view = vi.spyOn(Near.prototype, "view");
    liveChain(memberPolicy());
    const answer = view.getMockImplementation();
    const slow = () => new Promise((resolve) => setTimeout(resolve, 30));
    view.mockImplementation(async (contractId, method, args) => {
      await slow();
      return answer?.(contractId, method, args);
    });
    stubChainTime(async () => {
      await slow();
      return BigInt(realDateNow()) * 1_000_000n;
    });
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    const { client } = renderCard();
    await waitFor(() => expect(actionButton().disabled).toBe(false), { timeout: 2000 });
    fireEvent.click(actionButton());
    fireEvent.click(await screen.findByTestId("dashboard-node.team-stake-unstake-confirm"));
    await new Promise((resolve) => setTimeout(resolve, 5));
    void client.refetchQueries({ queryKey: ["team-pool-proposals"] });
    await waitFor(() => expect(poolActionMocks.proposeTeamPoolAction).toHaveBeenCalledTimes(1), {
      timeout: 2000,
    });
    expect(poolActionMocks.toastError).not.toHaveBeenCalled();
  });

  it("re-reads once and proposes when only a background refresh landed during the read", async () => {
    const chain = liveChain(memberPolicy());
    poolActionMocks.proposeTeamPoolAction.mockReturnValue(Effect.void);
    const { client } = renderCard();
    await confirmHeld(chain, "delegation_balance_of");
    await client.refetchQueries({ queryKey: ["team-pool-proposals"] });
    await settle();
    chain.release();
    await waitFor(() => expect(poolActionMocks.proposeTeamPoolAction).toHaveBeenCalledTimes(1));
  });
});

describe("teamPoolState", () => {
  const team = target.teamAccountId;

  it("earns as today in the DAO's own validating pool, even at a 100% fee", () => {
    expect(teamPoolState(earningPool(), team)).toEqual({ kind: "earning" });
  });

  it("names another owner and its fee, and keeps claiming", () => {
    expect(
      teamPoolState(
        earningPool({ ownerId: "operator.near", feeNumerator: 9996, feeDenominator: 10000 }),
        team,
      ),
    ).toEqual({
      kind: "run-by-other",
      ownerId: "operator.near",
      feeNumerator: 9996,
      feeDenominator: 10000,
    });
  });

  it("decides a 100% fee from the exact fraction", () => {
    expect(
      teamPoolState(
        earningPool({ ownerId: "operator.near", feeNumerator: 1000, feeDenominator: 1000 }),
        team,
      ),
    ).toEqual({ kind: "full-commission", ownerId: "operator.near" });
  });

  it("puts paused staking before the validator set and the fee", () => {
    expect(
      teamPoolState(
        earningPool({ ownerId: "operator.near", stakingPaused: true, validatorSet: "none" }),
        team,
      ),
    ).toEqual({ kind: "paused", ownerId: "operator.near" });
    expect(teamPoolState(earningPool({ stakingPaused: true }), team)).toEqual({
      kind: "paused",
      ownerId: null,
    });
  });

  it("shows another account's pool that isn't validating as not validating, with its owner", () => {
    expect(
      teamPoolState(earningPool({ ownerId: "operator.near", validatorSet: "none" }), team),
    ).toEqual({ kind: "not-validating", ownerId: "operator.near" });
  });

  it("treats a pool only in the next set as joining", () => {
    expect(teamPoolState(earningPool({ validatorSet: "next" }), team)).toEqual({
      kind: "joining",
    });
  });
});

describe("TeamStakeCard pool state", () => {
  const unstakeOffered = async () => {
    const action = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((action as HTMLButtonElement).disabled).toBe(false));
    expect(action.textContent).toBe("Propose unstake");
  };

  const unstakeHidden = async (testId: string) => {
    await screen.findByTestId(testId);
    await screen.findByText("2.5 NEAR");
    expect(screen.queryByTestId("dashboard-node.team-stake-unstake")).toBeNull();
  };

  it("adds nothing for the DAO's own validating pool", async () => {
    stubChain(teamAccount(), []);
    renderCard();
    await unstakeOffered();
    expect(screen.queryByTestId(/dashboard-node\.team-stake-pool-/)).toBeNull();
  });

  it("names another owner with a 99.96% fee as 99.9% and still offers the claim", async () => {
    poolActionMocks.poolStatus = earningPool({
      ownerId: "operator.near",
      feeNumerator: 9996,
      feeDenominator: 10000,
    });
    stubChain(teamAccount(), []);
    renderCard();
    await unstakeOffered();
    const note = screen.getByTestId("dashboard-node.team-stake-pool-run-by-other");
    expect(note.textContent).toContain(
      "This pool is run by operator.near. Your DAO's stake earns rewards, minus the pool's 99.9% fee.",
    );
    expect(note.querySelector("a")?.getAttribute("href")).toBe(
      "https://nearblocks.io/address/india.poolv1.near",
    );
  });

  it("hides the claim when another account takes the whole fee", async () => {
    poolActionMocks.poolStatus = earningPool({ ownerId: "operator.near" });
    stubChain(teamAccount(), []);
    renderCard();
    await unstakeHidden("dashboard-node.team-stake-pool-full-commission");
    expect(
      screen.getByTestId("dashboard-node.team-stake-pool-full-commission").textContent,
    ).toContain("all rewards go to operator.near and none to your DAO");
  });

  it("hides the claim while the pool's staking is paused", async () => {
    poolActionMocks.poolStatus = earningPool({ stakingPaused: true });
    stubChain(teamAccount(), []);
    renderCard();
    await unstakeHidden("dashboard-node.team-stake-pool-paused");
    expect(screen.getByTestId("dashboard-node.team-stake-pool-paused").textContent).not.toContain(
      "Run by",
    );
  });

  it("hides the claim for another account's pool that isn't validating and names its owner", async () => {
    poolActionMocks.poolStatus = earningPool({ ownerId: "operator.near", validatorSet: "none" });
    stubChain(teamAccount(), []);
    renderCard();
    await unstakeHidden("dashboard-node.team-stake-pool-not-validating");
    const note = screen.getByTestId("dashboard-node.team-stake-pool-not-validating");
    expect(note.textContent).toContain("This pool isn't validating");
    expect(note.textContent).toContain("Run by operator.near.");
  });

  it("hides the claim while the pool is only joining the validator set", async () => {
    poolActionMocks.poolStatus = earningPool({ validatorSet: "next" });
    stubChain(teamAccount(), []);
    renderCard();
    await unstakeHidden("dashboard-node.team-stake-pool-joining");
  });

  it("pauses claiming when the pool's status can't be read, and offers it once a retry succeeds", async () => {
    poolActionMocks.poolStatus = new Error("RPC unavailable");
    stubChain(teamAccount(), []);
    renderCard();
    const failed = await screen.findByTestId("dashboard-node.team-stake-pool-status-failed");
    await screen.findByText("2.5 NEAR");
    expect(screen.queryByTestId("dashboard-node.team-stake-unstake")).toBeNull();
    expect(screen.queryByTestId("dashboard-node.team-stake-read-failed")).toBeNull();
    poolActionMocks.poolStatus = null;
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }));
    await unstakeOffered();
    expect(screen.queryByTestId("dashboard-node.team-stake-pool-status-failed")).toBeNull();
  });

  it("keeps offering the withdraw of an unlocked balance whatever the pool's state", async () => {
    poolActionMocks.poolStatus = new Error("RPC unavailable");
    stubChain(teamAccount({ staked: 0n, unstaked: (3n * NEAR) / 2n }), []);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-pool-status-failed");
    const withdraw = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((withdraw as HTMLButtonElement).disabled).toBe(false));
    expect(withdraw.textContent).toBe("Propose withdraw");
  });

  it("shows only the pending proposal when one is open on a pool that isn't validating", async () => {
    poolActionMocks.poolStatus = earningPool({ validatorSet: "none" });
    stubChain(teamAccount(), [poolProposal()]);
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-proposal-pending");
    await settle();
    expect(screen.queryByTestId("dashboard-node.team-stake-pool-not-validating")).toBeNull();
  });

  it("shows only the read failure when the DAO can't be read on a pool that isn't validating", async () => {
    poolActionMocks.poolStatus = earningPool({ validatorSet: "none" });
    stubChain(teamAccount(), new Error("RPC unavailable"));
    renderCard();
    await screen.findByTestId("dashboard-node.team-stake-read-failed");
    await settle();
    expect(screen.queryByTestId("dashboard-node.team-stake-pool-not-validating")).toBeNull();
  });

  it("tells a linked DAO without a pool apart from no DAO", () => {
    renderCard({ target: null, teamLinked: true });
    expect(screen.getByTestId("dashboard-node.team-stake-no-pool").textContent).toContain(
      "No staking pool is linked to this community yet.",
    );
    expect(screen.queryByText("Link a team treasury to see its stake here.")).toBeNull();
  });
});
