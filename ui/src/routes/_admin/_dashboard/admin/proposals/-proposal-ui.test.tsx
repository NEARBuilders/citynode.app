// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import type { Proposal } from "@/lib/queries/proposals";
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
  operation: "create",
  schemaVersion: "1",
  rejectionReason: null,
  createdBy: "user-1",
  submissionCount: 1,
  createdAt: "2026-09-10T00:00:00.000Z",
  updatedAt: "2026-09-10T00:00:00.000Z",
};

describe("proposal review UI seams", () => {
  it("changes the validated filter and omits the default all value", () => {
    const onChange = vi.fn();
    render(<ProposalReviewFilters value="all" onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "Pending" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(screen.getAllByText("node-1").length).toBeGreaterThan(0);
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
        onRetry={onRetry}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Something went wrong while loading proposals.")).toBeTruthy();
    expect(screen.queryByText("proposal API unavailable")).toBeNull();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("needs no DAO wallet to decide and asks for a reason before rejecting", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onRejectionReasonChange = vi.fn();
    const props = {
      isReviewing: false,
      onRejectionReasonChange,
      onApprove,
      onReject,
    };
    const { rerender } = render(<ProposalReviewActions {...props} rejectionReason="" />);

    expect(screen.queryByTestId("connect-dao")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(onApprove).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    const confirm = screen.getByRole("button", { name: "Reject proposal" });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "not enough detail" } });
    expect(onRejectionReasonChange).toHaveBeenCalled();

    rerender(<ProposalReviewActions {...props} rejectionReason="not enough detail" />);
    fireEvent.click(screen.getByRole("button", { name: "Reject proposal" }));

    expect(onReject).toHaveBeenCalledOnce();
  });

  it("allows admin approval without a connected DAO", () => {
    const onApprove = vi.fn();
    render(
      <ProposalReviewActions
        rejectionReason=""
        isReviewing={false}
        onRejectionReasonChange={vi.fn()}
        onApprove={onApprove}
        onReject={vi.fn()}
      />,
    );

    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toHaveProperty("disabled", false);
    fireEvent.click(approve);
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it("reviews pending proposals and only views decided ones", () => {
    const approved: Proposal = {
      ...proposal,
      id: "proposal-approved",
      entityId: "approved-community",
      reviewStatus: "approved",
    };
    render(
      <ProposalListState
        activeFilter="all"
        columns={createProposalColumns()}
        proposals={[proposal, approved]}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
      />,
    );

    const table = screen.getByTestId("admin-proposals-table");
    const links = Array.from(table.querySelectorAll("a")).map((link) => link.textContent);
    expect(links.filter((label) => label === "Review")).toHaveLength(1);
    expect(links.filter((label) => label === "View")).toHaveLength(1);
    expect(links).not.toContain("Resume");
    expect(table.textContent).not.toContain("Setup");
  });
});
