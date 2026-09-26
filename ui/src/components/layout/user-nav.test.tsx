// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserNav } from "./user-nav";

const identity = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  isSessionLoading: false,
  nearAccountId: "elliot.near" as string | null,
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

vi.mock("./theme-toggle", () => ({
  ThemeToggle: () => <button type="button" aria-label="Switch theme" />,
}));

vi.mock("./network-toggle", () => ({
  NetworkToggle: () => null,
}));

vi.mock("./org-switcher", () => ({
  OrgSwitcher: ({ organizations }: { organizations: Array<{ name: string }> }) => (
    <button type="button">{organizations[0]?.name ?? "workspace"}</button>
  ),
}));

vi.mock("@/app", () => ({
  pluginPath: (path: string) => path,
}));

vi.mock("@tanstack/react-router", () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => children,
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  identity.user = { id: "user-1" };
  identity.isSessionLoading = false;
  identity.organizations = [];
  identity.activeOrgId = null;
  identity.activeOrg = undefined;
  vi.clearAllMocks();
});

describe("UserNav", () => {
  it("shows the account menu trigger for a signed-in user", () => {
    render(<UserNav />);
    const trigger = screen.getByTestId("account-menu");
    expect(trigger.getAttribute("aria-label")).toBe("elliot");
  });

  it("shows a Sign in button for signed-out visitors", () => {
    identity.user = null;
    render(<UserNav />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(screen.queryByTestId("account-menu")).toBeNull();
  });

  it("hides Sign in when the page is the sign-in page", () => {
    identity.user = null;
    render(<UserNav showSignIn={false} />);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("does not render an organization switcher next to the account menu", () => {
    identity.organizations = [{ id: "org-1", name: "Acme", slug: "acme" }];
    identity.activeOrgId = "org-1";
    identity.activeOrg = identity.organizations[0];
    render(<UserNav />);
    expect(screen.queryByRole("button", { name: "Acme" })).toBeNull();
  });
});
