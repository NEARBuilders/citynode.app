import { describe, expect, it } from "vitest";
import { hasNodeProposalReviewPermission } from "./node-access";

describe("node proposal review permission", () => {
  it("allows platform administrators", () => {
    expect(hasNodeProposalReviewPermission("admin")).toBe(true);
  });

  it("keeps organization-only members read-only", () => {
    expect(hasNodeProposalReviewPermission("user")).toBe(false);
    expect(hasNodeProposalReviewPermission(null)).toBe(false);
  });
});
