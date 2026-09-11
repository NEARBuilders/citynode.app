// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeamStakeCard } from "./team-stake-card";

const target = {
  teamAccountId: "india.sputnik-dao.near",
  poolAccountId: "india.poolv1.near",
  network: "mainnet",
  protocol: "near",
};
const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
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
});
