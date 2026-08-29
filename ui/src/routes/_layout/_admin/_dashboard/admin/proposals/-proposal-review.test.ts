import { describe, expect, it } from "vitest";
import { parseProposalReviewFilter, proposalReviewStatusVariant } from "./-proposal-review";

describe("proposal review filters", () => {
  it.each(["pending", "approved", "rejected", "all"])("accepts %s", (filter) => {
    expect(parseProposalReviewFilter(filter)).toBe(filter);
  });

  it.each([undefined, null, "removed", "unknown", 1])("rejects %s", (filter) => {
    expect(parseProposalReviewFilter(filter)).toBeUndefined();
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
