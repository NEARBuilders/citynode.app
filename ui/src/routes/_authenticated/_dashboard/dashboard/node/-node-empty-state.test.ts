import { describe, expect, it } from "vitest";
import { getNodeEmptyStateContent } from "./-node-empty-state";

describe("node dashboard empty state", () => {
  it("sends viewers without an organization to organization creation", () => {
    expect(getNodeEmptyStateContent("no-org", false)).toEqual({
      description: "Create an organization to start managing a City Node.",
      actionLabel: "create an organization",
      actionTo: "/orgs/new",
    });
  });

  it.each([
    {
      reason: "no-tenant",
      viewer: "administrator",
      canCreateNode: true,
      actionLabel: "create node",
      actionTo: "/admin/tenants/new",
    },
    {
      reason: "no-node",
      viewer: "administrator",
      canCreateNode: true,
      actionLabel: "create node",
      actionTo: "/admin/tenants/new",
    },
    {
      reason: "no-tenant",
      viewer: "member",
      canCreateNode: false,
      actionLabel: "propose a node",
      actionTo: "/apply",
    },
    {
      reason: "no-node",
      viewer: "member",
      canCreateNode: false,
      actionLabel: "propose a node",
      actionTo: "/apply",
    },
  ] as const)("sends a $viewer with $reason to $actionTo", (scenario) => {
    expect(getNodeEmptyStateContent(scenario.reason, scenario.canCreateNode)).toMatchObject({
      actionLabel: scenario.actionLabel,
      actionTo: scenario.actionTo,
    });
  });

  it("explains whether the active organization lacks a tenant or a node", () => {
    expect(getNodeEmptyStateContent("no-tenant", false).description).toBe(
      "Your active organization does not have a tenant deployment yet.",
    );
    expect(getNodeEmptyStateContent("no-node", false).description).toBe(
      "Your active organization's tenant does not manage a City Node yet.",
    );
  });
});
