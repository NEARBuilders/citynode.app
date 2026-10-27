// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { StakingPoolApprovalBadge } from "./staking-pool-approval-badge";

const harness = vi.hoisted(() => ({ getStakingPoolApproval: vi.fn() }));

vi.mock("@/app", () => ({
  useApiClient: () => ({ getStakingPoolApproval: harness.getStakingPoolApproval }),
}));

afterEach(() => {
  cleanup();
  harness.getStakingPoolApproval.mockReset();
});

function renderBadge(protocol = "near") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <span data-testid="row">
        <StakingPoolApprovalBadge accountId="pool.near" network="mainnet" protocol={protocol} />
      </span>
    </QueryClientProvider>,
  );
}

describe("StakingPoolApprovalBadge", () => {
  it("flags an account that isn't an approved staking pool", async () => {
    harness.getStakingPoolApproval.mockResolvedValue({ approved: false });
    renderBadge();

    expect((await screen.findByTestId("validator.not-approved-pool")).textContent).toBe(
      "Not an approved staking pool",
    );
    expect(harness.getStakingPoolApproval).toHaveBeenCalledWith({
      accountId: "pool.near",
      network: "mainnet",
    });
  });

  it("shows nothing for an approved pool", async () => {
    harness.getStakingPoolApproval.mockResolvedValue({ approved: true });
    renderBadge();

    await waitFor(() => expect(harness.getStakingPoolApproval).toHaveBeenCalled());
    expect(screen.queryByTestId("validator.not-approved-pool")).toBeNull();
  });

  it("shows nothing when the check fails", async () => {
    harness.getStakingPoolApproval.mockRejectedValue(new Error("rpc down"));
    renderBadge();

    await waitFor(() => expect(harness.getStakingPoolApproval).toHaveBeenCalled());
    expect(screen.queryByTestId("validator.not-approved-pool")).toBeNull();
  });

  it("doesn't check validators on other protocols", () => {
    renderBadge("other");

    expect(harness.getStakingPoolApproval).not.toHaveBeenCalled();
    expect(screen.queryByTestId("validator.not-approved-pool")).toBeNull();
  });
});
