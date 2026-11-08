// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { CommunityRewardsBadge, CommunityRewardsStat } from "./-community-rewards-ui";

vi.mock("@/app", () => ({ useApiClient: () => ({}), useAuthClient: () => ({}) }));

afterEach(cleanup);

describe("CommunityRewardsBadge", () => {
  it("labels a community that can claim", () => {
    render(
      <CommunityRewardsBadge
        read={{ rewards: { kind: "pool", pool: { kind: "earning" } }, retry: () => {} }}
      />,
    );
    expect(screen.getByTestId("admin-progress-rewards").textContent).toBe("Can claim");
    expect(screen.queryByTestId("admin-progress-rewards-detail")).toBeNull();
  });

  it("explains a pool another account runs with the owners' wording", () => {
    render(
      <CommunityRewardsBadge
        read={{
          rewards: {
            kind: "pool",
            pool: {
              kind: "run-by-other",
              ownerId: "operator.near",
              feeNumerator: 10,
              feeDenominator: 100,
            },
          },
          retry: () => {},
        }}
      />,
    );
    expect(screen.getByTestId("admin-progress-rewards").textContent).toBe(
      "Pool run by another account",
    );
    expect(screen.getByTestId("admin-progress-rewards-detail")).toBeTruthy();
  });

  it("shows a failed read as an error with Retry, never as a pool state", () => {
    const retry = vi.fn();
    render(<CommunityRewardsBadge read={{ rewards: { kind: "error" }, retry }} />);
    expect(screen.queryByTestId("admin-progress-rewards")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("says when there's no DAO or no pool", () => {
    const view = render(
      <CommunityRewardsBadge read={{ rewards: { kind: "no-dao" }, retry: () => {} }} />,
    );
    expect(screen.getByTestId("admin-progress-rewards").textContent).toBe("No DAO");
    view.rerender(
      <CommunityRewardsBadge read={{ rewards: { kind: "no-pool" }, retry: () => {} }} />,
    );
    expect(screen.getByTestId("admin-progress-rewards").textContent).toBe("No pool");
  });
});

describe("CommunityRewardsStat", () => {
  it("counts communities that can claim and says how many couldn't be read", () => {
    const onRetry = vi.fn();
    render(
      <CommunityRewardsStat
        summary={{ loading: false, canClaim: 2, unreadable: 1 }}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByTestId("admin.stat.can-claim").textContent).toContain("2");
    expect(screen.getByTestId("admin.stat.can-claim-unreadable").textContent).toContain(
      "1 community couldn't be read",
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("leaves out the unreadable note when every community was read", () => {
    render(
      <CommunityRewardsStat
        summary={{ loading: false, canClaim: 0, unreadable: 0 }}
        onRetry={() => {}}
      />,
    );
    expect(screen.queryByTestId("admin.stat.can-claim-unreadable")).toBeNull();
  });
});
