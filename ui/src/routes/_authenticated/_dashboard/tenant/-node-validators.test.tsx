// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { TenantNodeValidators } from "./-node-validators";

const harness = vi.hoisted(() => ({
  getStakingPoolApproval: vi.fn(),
  fetchPoolOwner: vi.fn(async () => null),
}));

vi.mock("@/app", () => ({
  useApiClient: () => ({
    listNodes: async () => [{ id: "node-1", name: "City" }],
    listValidatorsByNode: async () => [
      {
        id: "validator-1",
        nodeId: "node-1",
        accountId: "pool.near",
        network: "mainnet",
        protocol: "near",
        role: "official",
        isDefault: true,
      },
    ],
    getStakingPoolApproval: harness.getStakingPoolApproval,
  }),
}));

vi.mock("@/lib/pool-owner", () => ({ fetchPoolOwner: harness.fetchPoolOwner }));

afterEach(() => {
  cleanup();
  harness.getStakingPoolApproval.mockReset();
});

function renderValidators() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TenantNodeValidators tenantId="tenant-1" canManage={false} />
    </QueryClientProvider>,
  );
}

describe("Community settings validators", () => {
  it("shows only the whitelist badge for an account that isn't an approved pool", async () => {
    harness.getStakingPoolApproval.mockResolvedValue({ approved: false });
    renderValidators();

    expect(await screen.findByTestId("validator.not-approved-pool")).toBeTruthy();
    expect(screen.queryByText("Not a staking pool")).toBeNull();
  });

  it("falls back to the owner check when the whitelist can't answer", async () => {
    harness.getStakingPoolApproval.mockRejectedValue(new Error("rpc down"));
    renderValidators();

    expect(await screen.findByText("Not a staking pool", {}, { timeout: 5_000 })).toBeTruthy();
    expect(screen.queryByTestId("validator.not-approved-pool")).toBeNull();
  });

  it("shows no not-a-pool warning for an approved pool whose owner can't be read", async () => {
    harness.getStakingPoolApproval.mockResolvedValue({ approved: true });
    renderValidators();

    await screen.findByTestId("tenant-validator-validator-1");
    await waitFor(() => {
      expect(harness.fetchPoolOwner).toHaveBeenCalled();
      expect(harness.getStakingPoolApproval).toHaveBeenCalled();
      expect(screen.queryByText("Checking pool owner…")).toBeNull();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Not a staking pool")).toBeNull();
    expect(screen.queryByTestId("validator.not-approved-pool")).toBeNull();
  });
});
