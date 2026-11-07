import { describe, expect, it } from "vitest";
import { getNodeEmptyStateContent } from "./-node-empty-state";

const destinations = (content: ReturnType<typeof getNodeEmptyStateContent>) =>
  content.actions.map((action) => action.to);

describe("My community empty state", () => {
  it.each([
    "no-org",
    "no-tenant",
    "no-node",
  ] as const)("offers Explore before Start a community to members (%s)", (reason) => {
    const content = getNodeEmptyStateContent(reason, false);
    expect(destinations(content)).toEqual(["/explore", "/apply"]);
    expect(content.actions.map((action) => action.primary)).toEqual([true, false]);
    expect(content.actions.map((action) => action.label)).toEqual([
      "Explore communities",
      "Start a community",
    ]);
  });

  it.each([
    "no-org",
    "no-tenant",
    "no-node",
  ] as const)("sends admins (%s) to create the community", (reason) => {
    expect(destinations(getNodeEmptyStateContent(reason, true))).toEqual(["/apply"]);
  });

  it("does not mention an organization to viewers who have none selected", () => {
    expect(getNodeEmptyStateContent("no-org", false)).toMatchObject({
      title: "No community yet",
      description: "Find a community near you on Explore, or apply to start one for your area.",
    });
    expect(getNodeEmptyStateContent("no-org", true).title).toBe("No community yet");
  });

  it("tells admins to launch by approving their own application", () => {
    expect(getNodeEmptyStateContent("no-node", true).description).toBe(
      "Apply for the community with its DAO, then approve the application in Admin.",
    );
  });

  it("asks a member with communities to choose one instead of starting a new one", () => {
    expect(getNodeEmptyStateContent("choose", false, undefined, 2)).toEqual({
      title: "Choose a community",
      description: "You belong to 2 communities. Pick the one to open.",
      actions: [{ label: "Choose", to: "/orgs", primary: true }],
    });
  });
});
