// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { CommunityNav } from "./-community-nav";

vi.mock("@tanstack/react-router", () => ({
  Link: forwardRef<HTMLAnchorElement, { children?: ReactNode }>(({ children, ...props }, ref) => (
    <a ref={ref} href="/" {...props}>
      {children}
    </a>
  )),
}));

afterEach(cleanup);

function shownTabs() {
  return ["overview", "content", "onboarding", "proposals", "bulletin", "settings"].filter(
    (value) => screen.queryByTestId(`community-nav-${value}`),
  );
}

describe("CommunityNav", () => {
  it("gives owners every community tab", () => {
    render(<CommunityNav active="overview" nodeId="node-1" tenantId="tenant-1" canManage />);

    expect(shownTabs()).toEqual([
      "overview",
      "content",
      "onboarding",
      "proposals",
      "bulletin",
      "settings",
    ]);
  });

  it("gives organizers Events and Onboarding but not the owner-only tabs", () => {
    render(
      <CommunityNav
        active="overview"
        nodeId="node-1"
        tenantId="tenant-1"
        canManage={false}
        canOrganize
      />,
    );

    expect(shownTabs()).toEqual(["overview", "content", "onboarding", "proposals"]);
  });

  it("keeps Events and Onboarding from members without the events area", () => {
    render(
      <CommunityNav
        active="overview"
        nodeId="node-1"
        tenantId="tenant-1"
        canManage={false}
        canOrganize={false}
      />,
    );

    expect(shownTabs()).toEqual(["overview", "proposals"]);
  });

  it("shows an active events team its event sections next to Overview and Proposals", () => {
    render(
      <CommunityNav
        active="overview"
        nodeId="node-1"
        tenantId="tenant-1"
        canManage={false}
        canOrganize
        allowedAreas={["events"]}
      />,
    );

    expect(shownTabs()).toEqual(["overview", "content", "onboarding", "proposals"]);
  });

  it.each([
    ["stake"],
    ["finance"],
    ["node-operations"],
  ] as const)("keeps Overview and Proposals for an active %s team", (area) => {
    render(
      <CommunityNav
        active="overview"
        nodeId="node-1"
        tenantId="tenant-1"
        canManage={false}
        canOrganize={false}
        allowedAreas={[area]}
      />,
    );

    expect(shownTabs()).toEqual(["overview", "proposals"]);
  });
});
