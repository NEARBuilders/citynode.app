// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen } from "@testing-library/react";
import { Near } from "near-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { type StakeValidator, StakeValidatorList } from "./-stake-validator-list";

vi.mock("@/app", () => ({
  useAuthClient: () => ({
    near: { getNearClient: () => new Near({ network: "mainnet" }) },
  }),
}));

const validator: StakeValidator = {
  id: "pool",
  nodeId: "example",
  accountId: "example.poolv1.near",
  network: "mainnet",
  protocol: "near",
  role: "community",
  isDefault: true,
  metadata: {},
  createdAt: "2026-09-10",
  updatedAt: "2026-09-10",
};
const clients: QueryClient[] = [];

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
});

function renderList(feeNumerator: number) {
  const values: Record<string, unknown> = {
    get_total_staked_balance: "1000000000000000000000000",
    get_reward_fee_fraction: { numerator: feeNumerator, denominator: 100 },
    get_number_of_accounts: 1,
  };
  vi.spyOn(Near.prototype, "view").mockImplementation((_contractId, method) =>
    Promise.resolve(values[method] ?? null),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <StakeValidatorList onSelect={() => {}} selectedValidatorId="pool" validators={[validator]} />
    </QueryClientProvider>,
  );
}

describe("StakeValidatorList", () => {
  it("says staking at a 100% commission pool supports the community and earns the staker nothing", async () => {
    renderList(100);
    expect(await screen.findByText(/100%/)).toBeTruthy();
    expect(screen.getByTestId("stake.full-commission").textContent).toContain(
      "Staking here supports this community; you won't earn rewards yourself.",
    );
  });

  it("keeps the standard fee display for pools below 100% commission", async () => {
    renderList(7);
    expect(await screen.findByText(/7%/)).toBeTruthy();
    expect(screen.queryByTestId("stake.full-commission")).toBeNull();
  });
});
