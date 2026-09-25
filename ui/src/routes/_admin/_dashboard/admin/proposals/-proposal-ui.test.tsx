// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "./-proposal-columns";
import { createProposalColumns } from "./-proposal-columns";
import { normalizeProposalReviewFilter, ProposalReviewFilters } from "./-proposal-filters";
import { ProposalListState } from "./-proposal-list-state";
import { ProposalReviewActions } from "./-proposal-review-actions";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

vi.mock("@/components/connect-dao", () => ({
  ConnectDao: () => <div data-testid="connect-dao" />,
}));

afterEach(cleanup);

const proposal: Proposal = {
  id: "proposal-1",
  pluginId: "node",
  entityId: "node-1",
  payload: {},
  reviewStatus: "pending",
  applyStatus: "not_started",
  operation: "create",
  schemaVersion: "1",
  removeStatus: "not_started",
  removeError: null,
  appliedResourceId: null,
  appliedAt: null,
  applyError: null,
  rejectionReason: null,
  removedAt: null,
  createdBy: "user-1",
  submissionCount: 1,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
};

describe("proposal review UI seams", () => {
  it("changes the validated filter and omits the default all value", () => {
    const onChange = vi.fn();
    render(<ProposalReviewFilters value="all" onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "pending" }));

    expect(onChange).toHaveBeenCalledWith("pending");
    expect(normalizeProposalReviewFilter("all")).toBeUndefined();
    expect(normalizeProposalReviewFilter("approved")).toBe("approved");
  });

  it("loads the next proposal page through the owned callback", () => {
    const onLoadMore = vi.fn();
    render(
      <ProposalListState
        activeFilter="pending"
        columns={createProposalColumns()}
        proposals={[proposal]}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        hasNextPage
        isFetchingNextPage={false}
        onLoadMore={onLoadMore}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "load more" }));

    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(screen.getByText("proposal-1")).toBeTruthy();
  });

  it("shows a retry control for a failed proposal list", () => {
    const onRetry = vi.fn();
    render(
      <ProposalListState
        activeFilter="all"
        columns={[]}
        proposals={[]}
        isLoading={false}
        isError
        errorMessage="proposal API unavailable"
        onRetry={onRetry}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "retry" }));

    expect(screen.getByText("proposal API unavailable")).toBeTruthy();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps the DAO gate visible and forwards review controls without live writes", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onDaoVerified = vi.fn();
    render(
      <ProposalReviewActions
        isPending
        isNodeProposal
        proposalDaoAccountId="dao.sputnik-dao.near"
        daoIsVerified
        rejectionReason="not enough detail"
        isReviewing={false}
        onDaoVerified={onDaoVerified}
        onRejectionReasonChange={vi.fn()}
        onApprove={onApprove}
        onReject={onReject}
      />,
    );

    expect(screen.getByTestId("connect-dao")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "approve" }));
    fireEvent.click(screen.getByRole("button", { name: "reject" }));

    expect(onApprove).toHaveBeenCalledOnce();
    expect(onReject).toHaveBeenCalledOnce();
    expect(onDaoVerified).not.toHaveBeenCalled();
  });
});
