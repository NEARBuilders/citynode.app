import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/app";
import {
  adminProposalDetailQueryOptions,
  adminProposalListQueryOptions,
  parseProposalReviewFilter,
  proposalReviewHistoryQueryOptions,
  proposalReviewQueryKeys,
  proposalReviewStatusVariant,
} from "./-proposal-review";

describe("proposal review filters", () => {
  it.each(["pending", "approved", "rejected", "all"])("accepts %s", (filter) => {
    expect(parseProposalReviewFilter(filter)).toBe(filter);
  });

  it.each([undefined, null, "removed", "unknown", 1])("rejects %s", (filter) => {
    expect(parseProposalReviewFilter(filter)).toBeUndefined();
  });

  it("keys the review list by filter and forwards pagination cursors", async () => {
    const getProposals = vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, hasMore: false, nextCursor: null },
    });
    const apiClient = { proposals: { getProposals } } as unknown as ApiClient;
    const options = adminProposalListQueryOptions(apiClient, "approved");

    expect(options.queryKey).toEqual(proposalReviewQueryKeys.list("approved"));
    await options.queryFn?.({ pageParam: "50" } as never);

    expect(getProposals).toHaveBeenCalledWith({
      reviewStatus: "approved",
      limit: 50,
      cursor: "50",
    });
  });

  it("does not send a review status for the all filter", async () => {
    const getProposals = vi.fn().mockResolvedValue({
      data: [],
      meta: { total: 0, hasMore: false, nextCursor: null },
    });
    const apiClient = { proposals: { getProposals } } as unknown as ApiClient;
    const options = adminProposalListQueryOptions(apiClient, "all");

    await options.queryFn?.({ pageParam: undefined } as never);

    expect(getProposals).toHaveBeenCalledWith({ limit: 50 });
  });

  it("centralizes detail and review-history query keys", () => {
    const apiClient = { proposals: {} } as unknown as ApiClient;

    expect(
      adminProposalDetailQueryOptions(apiClient, "proposal-1", "node", "pakistan").queryKey,
    ).toEqual(proposalReviewQueryKeys.detail("proposal-1", "node", "pakistan"));
    expect(proposalReviewHistoryQueryOptions(apiClient, "node").queryKey).toEqual(
      proposalReviewQueryKeys.history("node"),
    );
  });
});

describe("proposal review status variants", () => {
  it("maps review states to semantic badge variants", () => {
    expect(proposalReviewStatusVariant("pending")).toBe("secondary");
    expect(proposalReviewStatusVariant("approved")).toBe("default");
    expect(proposalReviewStatusVariant("rejected")).toBe("destructive");
    expect(proposalReviewStatusVariant("removed")).toBe("outline");
  });
});
