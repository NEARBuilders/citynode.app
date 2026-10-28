// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import type { AuthRequestContext } from "@/lib/auth";
import { isPathAllowed, resolveTeamWorkspace } from "@/lib/team-workspace";
import { getNextSteps } from "./-next-steps";
import { NextStepsList } from "./-next-steps-list";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    hash: _hash,
    ...props
  }: {
    children?: ReactNode;
    to?: string;
    hash?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

describe("Home next steps for platform admins", () => {
  it("launches a community through the application, then the proposals queue", () => {
    const steps = getNextSteps({
      isAnonymous: false,
      hasPasskey: true,
      hasNear: true,
      organizationCount: 0,
      activeOrganizationName: null,
      community: null,
      canManageCommunity: false,
      canOrganizeEvents: false,
      isAdmin: true,
    });
    render(<NextStepsList steps={steps} primary={false} />);

    expect(screen.getByTestId("home-step-launch-node").getAttribute("href")).toBe("/apply");
    expect(screen.getByTestId("home-step-admin").getAttribute("href")).toBe("/admin/proposals");
  });
});

describe("Home next steps for team members", () => {
  const teams = [
    { id: "team-events", name: "Events", areas: ["events"] },
    { id: "team-stake", name: "Staking", areas: ["stake"] },
    { id: "team-fin", name: "Finance", areas: ["finance"] },
    { id: "team-ops", name: "Operations", areas: ["node-operations"] },
    { id: "team-empty", name: "Event Team", areas: [] },
  ];

  it.each([
    null,
    ...teams.map((team) => team.id),
  ])("only offers reachable actions with active team %s", (activeTeamId) => {
    const workspace = resolveTeamWorkspace({
      user: { role: null },
      organization: {
        activeOrganizationId: "org-1",
        member: { id: "m1", role: "member" },
        teams,
        activeTeamId,
      },
    } as AuthRequestContext);
    const steps = getNextSteps({
      isAnonymous: false,
      hasPasskey: true,
      hasNear: true,
      organizationCount: 1,
      activeOrganizationName: "Harbor",
      community: { name: "Harbor", tenantId: "tenant-1" },
      canManageCommunity: false,
      canOrganizeEvents: false,
      isAdmin: false,
    });
    render(<NextStepsList steps={steps} primary={false} />);

    expect(screen.getByTestId("home-step-open-community").getAttribute("href")).toBe(
      "/dashboard/node",
    );
    expect(screen.getByTestId("home-step-stake").getAttribute("href")).toBe("/stake");
    for (const step of steps) {
      const href = screen.getByTestId(`home-step-${step.id}`).getAttribute("href") ?? "";
      expect(isPathAllowed(workspace, href)).toBe(true);
    }
  });
});

describe("Home next steps for a plain member", () => {
  it("features their community first, then staking, and never asks for an email", () => {
    const steps = getNextSteps({
      isAnonymous: false,
      hasPasskey: true,
      hasNear: false,
      organizationCount: 1,
      activeOrganizationName: "Harbor",
      community: { name: "Harbor", tenantId: "tenant-1" },
      canManageCommunity: false,
      canOrganizeEvents: false,
      isAdmin: false,
    });
    render(<NextStepsList steps={steps} primary />);

    const items = screen
      .getByTestId("home-next-steps")
      .querySelectorAll("[data-testid^=home-step-]");
    expect([...items].map((item) => item.getAttribute("data-testid"))).toEqual([
      "home-step-open-community",
      "home-step-stake",
    ]);
    expect(screen.getByTestId("home-step-open-community").textContent).toContain("Open Harbor");
    expect(screen.getByRole("link", { name: "Open" }).getAttribute("href")).toBe("/dashboard/node");
    expect(screen.queryByText(/email/i)).toBeNull();
  });
});
