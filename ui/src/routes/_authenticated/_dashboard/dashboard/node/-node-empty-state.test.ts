import { describe, expect, it } from "vitest";
import { getNodeEmptyStateContent } from "./-node-empty-state";

describe("My community empty state", () => {
  it.each([
    { reason: "no-org", canCreateNode: true },
    { reason: "no-tenant", canCreateNode: true },
    { reason: "no-node", canCreateNode: true },
    { reason: "no-org", canCreateNode: false },
    { reason: "no-tenant", canCreateNode: false },
    { reason: "no-node", canCreateNode: false },
  ] as const)("sends $reason (admin: $canCreateNode) to the application", (scenario) => {
    expect(getNodeEmptyStateContent(scenario.reason, scenario.canCreateNode).actionTo).toBe(
      "/apply",
    );
  });

  it("does not mention an organization to viewers who have none selected", () => {
    expect(getNodeEmptyStateContent("no-org", false)).toMatchObject({
      title: "No community yet",
      description: "Apply to run a City Node for your area. We'll walk you through each step.",
      actionLabel: "Start a community",
    });
    expect(getNodeEmptyStateContent("no-org", true).title).toBe("No community yet");
  });

  it("tells admins to launch by approving their own application", () => {
    expect(getNodeEmptyStateContent("no-node", true).description).toBe(
      "Apply for the community with its DAO, then approve the application in Admin.",
    );
  });

  it("offers members Start a community", () => {
    expect(getNodeEmptyStateContent("no-node", false).actionLabel).toBe("Start a community");
  });
});
