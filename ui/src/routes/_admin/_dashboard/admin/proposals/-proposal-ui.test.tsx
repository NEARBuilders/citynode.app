// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { ApplicationProgressList } from "@/routes/_authenticated/_dashboard/-application-progress-list";
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
  applySteps: {},
  applyTimedOut: false,
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

  it("keeps the DAO gate visible and asks for a reason before rejecting", () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    const onDaoVerified = vi.fn();
    const onRejectionReasonChange = vi.fn();
    const props = {
      isPending: true,
      isNodeProposal: true,
      proposalDaoAccountId: "dao.sputnik-dao.near",
      daoIsVerified: true,
      isReviewing: false,
      onDaoVerified,
      onRejectionReasonChange,
      onApprove,
      onReject,
    };
    const { rerender } = render(<ProposalReviewActions {...props} rejectionReason="" />);

    expect(screen.getByTestId("connect-dao")).toBeTruthy();
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
    expect(onDaoVerified).not.toHaveBeenCalled();
  });

  it("allows admin approval without a connected DAO", () => {
    const onApprove = vi.fn();
    render(
      <ProposalReviewActions
        isPending
        isNodeProposal
        proposalDaoAccountId="dao.sputnik-dao.near"
        daoIsVerified={false}
        rejectionReason=""
        isReviewing={false}
        onDaoVerified={vi.fn()}
        onRejectionReasonChange={vi.fn()}
        onApprove={onApprove}
        onReject={vi.fn()}
      />,
    );

    const approve = screen.getByRole("button", { name: "Approve" });
    expect(approve).toHaveProperty("disabled", false);
    expect(screen.getByText(/Approval can proceed without a DAO connection/)).toBeTruthy();
    fireEvent.click(approve);
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it("lets an admin retry a failed application and shows the recorded error", () => {
    const onApprove = vi.fn();
    render(
      <ProposalReviewActions
        isPending={false}
        isRetry
        applyError="User closed the window"
        isNodeProposal
        proposalDaoAccountId="dao.sputnik-dao.near"
        daoIsVerified={false}
        rejectionReason=""
        isReviewing={false}
        onDaoVerified={vi.fn()}
        onRejectionReasonChange={vi.fn()}
        onApprove={onApprove}
        onReject={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("User closed the window");
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
    expect(screen.getByText(/Connect the proposed DAO with Trezu before retrying/)).toBeTruthy();
    expect(screen.getByText(/continues from the first unfinished step/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it("offers only Resume for a stalled setup that is still applying", () => {
    const onApprove = vi.fn();
    render(
      <ProposalReviewActions
        isPending={false}
        isRetry
        canReject={false}
        isNodeProposal
        proposalDaoAccountId="dao.sputnik-dao.near"
        daoIsVerified
        rejectionReason=""
        isReviewing={false}
        onDaoVerified={vi.fn()}
        onRejectionReasonChange={vi.fn()}
        onApprove={onApprove}
        onReject={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "Reject" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(onApprove).toHaveBeenCalledOnce();
  });

  it("lists failed and stalled setups with a resume action", () => {
    const failed: Proposal = {
      ...proposal,
      id: "proposal-failed",
      entityId: "failed-community",
      reviewStatus: "approved",
      applyStatus: "failed",
      applyError: "Tenant creation failed",
    };
    const stalled: Proposal = {
      ...proposal,
      id: "proposal-stalled",
      entityId: "stalled-community",
      reviewStatus: "approved",
      applyStatus: "applying",
      applyTimedOut: true,
    };
    const waiting: Proposal = {
      ...failed,
      id: "proposal-waiting",
      entityId: "waiting-community",
      applySteps: {
        publication: { status: "waiting", resourceId: "4", recordedAt: "2026-09-10T00:05:00.000Z" },
      },
    };
    render(
      <ProposalListState
        activeFilter="pending"
        columns={createProposalColumns()}
        proposals={[proposal, failed, stalled, waiting]}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
        isFetchingNextPage={false}
        onLoadMore={vi.fn()}
      />,
    );

    const table = screen.getByTestId("admin-proposals-table");
    expect(table.textContent).toContain("Setup failed");
    expect(table.textContent).toContain("Setup stalled");
    expect(table.textContent).toContain("Waiting for DAO vote");
    expect(
      Array.from(table.querySelectorAll("a")).filter((link) => link.textContent === "Resume"),
    ).toHaveLength(3);
    expect(
      Array.from(table.querySelectorAll("a")).filter((link) => link.textContent === "Review"),
    ).toHaveLength(1);
  });

  it("shows each recorded setup step and the open DAO vote", () => {
    render(
      <ApplicationProgressList
        proposal={{
          reviewStatus: "approved",
          applyStatus: "failed",
          applyTimedOut: false,
          appliedAt: null,
          applySteps: {
            organization: {
              status: "completed",
              resourceId: "community-proposal-1",
              recordedAt: "2026-09-10T00:01:00.000Z",
            },
            community: {
              status: "completed",
              resourceId: "node-uuid",
              recordedAt: "2026-09-10T00:02:00.000Z",
            },
            publication: {
              status: "waiting",
              resourceId: "4",
              recordedAt: "2026-09-10T00:03:00.000Z",
            },
          },
        }}
        daoAccountId="dao.sputnik-dao.near"
        showResources
      />,
    );

    const state = (id: string) =>
      screen.getByTestId(`application-progress-${id}`).getAttribute("data-state");
    expect(state("approval")).toBe("done");
    expect(state("organization")).toBe("done");
    expect(state("community")).toBe("done");
    expect(state("publication")).toBe("waiting");
    expect(state("complete")).toBe("upcoming");
    expect(screen.getByText("community-proposal-1")).toBeTruthy();
    const vote = screen.getByTestId("application-progress-dao-vote");
    expect(vote.getAttribute("href")).toBe("https://trezu.app/dao.sputnik-dao.near/requests");
    expect(vote.textContent).toContain("#4");
  });
});
