// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

const identity = vi.hoisted(() => ({
  user: { id: "user-1" },
  isSessionLoading: false,
  nearAccountId: "elliot.near",
  organizations: [] as Array<{ id: string; name: string; slug: string }>,
  activeOrgId: null as string | null,
  activeOrg: undefined as { id: string; name: string; slug: string } | undefined,
  signOutMutation: { mutate: vi.fn(), isPending: false },
  avatarSrc: undefined as string | undefined,
  displayName: "elliot",
  handle: "elliot.near",
  showHandle: true,
  initials: "E",
}));

vi.mock("./use-identity", () => ({
  useIdentity: () => identity,
}));

vi.mock("./use-switch-team", () => ({
  useSwitchTeam: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("./theme-toggle", () => ({
  ThemeToggle: () => <button type="button" aria-label="Switch theme" />,
}));

vi.mock("./network-toggle", () => ({
  NetworkToggle: () => null,
}));

vi.mock("./org-switcher", () => ({
  OrgSwitcher: () => <button type="button">workspace</button>,
}));

vi.mock("./sidebar-org-switcher", () => ({
  SidebarOrgSwitcher: ({ appName }: { appName: string }) => (
    <button type="button" data-testid="org-switcher">
      {appName}
    </button>
  ),
}));

vi.mock("@/app", () => ({
  getAccount: () => "v1.citynode.near",
  getActiveRuntime: () => ({ accountId: "v1.citynode.near" }),
  getAppName: () => "City Nodes",
}));

vi.mock("@tanstack/react-router", () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => children,
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useRouterState: ({
    select,
  }: {
    select: (state: { location: { pathname: string } }) => unknown;
  }) => select({ location: { pathname: "/dashboard" } }),
}));

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("app shell chrome", () => {
  it("places User Nav in the app header", () => {
    render(
      <SidebarProvider>
        <AppHeader />
      </SidebarProvider>,
    );
    expect(screen.getByTestId("account-menu")).toBeTruthy();
  });

  it("shows which team the user is operating as", () => {
    render(
      <SidebarProvider>
        <AppHeader activeTeamName="Finance" />
      </SidebarProvider>,
    );
    expect(screen.getByTestId("workspace-active-team").textContent).toContain("Finance");
    cleanup();

    render(
      <SidebarProvider>
        <AppHeader />
      </SidebarProvider>,
    );
    expect(screen.queryByTestId("workspace-active-team")).toBeNull();
  });

  it("does not place the account menu in the sidebar footer", () => {
    render(
      <SidebarProvider>
        <AppSidebar items={[]} appName="City Nodes" pathname="/dashboard" />
      </SidebarProvider>,
    );

    expect(screen.queryByTestId("account-menu")).toBeNull();
    expect(screen.queryByRole("button", { name: "elliot" })).toBeNull();
  });
});
