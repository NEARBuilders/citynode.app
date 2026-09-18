// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamStakeCard } from "./team-stake-card";

const target = {
  teamAccountId: "india.sputnik-dao.near",
  poolAccountId: "india.poolv1.near",
  network: "mainnet",
  protocol: "near",
};
const clients: QueryClient[] = [];
const poolActionMocks = vi.hoisted(() => ({
  proposeTeamPoolAction: vi.fn(),
}));

vi.mock("@/lib/use-near-account", () => ({
  useNearAccount: () => "itexpert120-contra.near",
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
  for (const client of clients.splice(0)) client.clear();
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

function stubPool(account: Record<string, unknown>, total = "999000000000000000000000000") {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const method = JSON.parse(String(init.body)).params.method_name;
      const value =
        method === "get_account" ? account : method === "get_total_staked_balance" ? total : null;
      return Response.json({
        result: { result: [...new TextEncoder().encode(JSON.stringify(value))] },
      });
    }),
  );
}

describe("TeamStakeCard", () => {
  it("shows the team account's staked balance, not the pool total", async () => {
    stubPool({
      account_id: "india.sputnik-dao.near",
      staked_balance: "2500000000000000000000000",
      unstaked_balance: "0",
      can_withdraw: true,
    });
    renderCard();
    expect(await screen.findByText("2.5 NEAR")).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("2.5 NEAR");
    expect(screen.queryByText("999 NEAR")).toBeNull();
    expect(screen.getByText("india.sputnik-dao.near")).toBeTruthy();
    expect(screen.getByText("india.poolv1.near")).toBeTruthy();
  });

  it("explains when the team account or staking pool is missing", () => {
    renderCard({ target: null });
    expect(screen.getByTestId("dashboard-node.team-stake")).toBeTruthy();
    expect(
      screen.getByText("Team stake appears once a team DAO and staking pool are linked."),
    ).toBeTruthy();
    expect(screen.queryByTestId("dashboard-node.team-stake-amount")).toBeNull();
    expect(screen.queryByTestId("dashboard-node.team-stake-unstake")).toBeNull();
  });

  it("keeps the amount unavailable when the pool account view fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: { message: "Unavailable" } })),
    );
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("—"),
    );
  });

  it("proposes an unstake of some team stake without an attached deposit", async () => {
    stubPool({
      account_id: "india.sputnik-dao.near",
      staked_balance: "2500000000000000000000000",
      unstaked_balance: "0",
      can_withdraw: true,
    });
    poolActionMocks.proposeTeamPoolAction.mockResolvedValue(undefined);
    renderCard();
    const unstake = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((unstake as HTMLButtonElement).disabled).toBe(false));
    expect(unstake.textContent).toBe("propose unstake");
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
    stubPool({
      account_id: "india.sputnik-dao.near",
      staked_balance: "0",
      unstaked_balance: "1500000000000000000000000",
      can_withdraw: false,
    });
    renderCard();
    const unstake = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((unstake as HTMLButtonElement).disabled).toBe(true));
    expect(
      await screen.findByTestId("dashboard-node.team-stake-pending-release"),
    ).toBeTruthy();
    expect(screen.getByTestId("dashboard-node.team-stake-amount").textContent).toBe("1.5 NEAR");
  });

  it("proposes a withdraw once the epoch window has passed", async () => {
    stubPool({
      account_id: "india.sputnik-dao.near",
      staked_balance: "0",
      unstaked_balance: "1500000000000000000000000",
      can_withdraw: true,
    });
    poolActionMocks.proposeTeamPoolAction.mockResolvedValue(undefined);
    renderCard();
    const withdraw = await screen.findByTestId("dashboard-node.team-stake-unstake");
    await waitFor(() => expect((withdraw as HTMLButtonElement).disabled).toBe(false));
    expect(withdraw.textContent).toBe("propose withdraw");
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
});
