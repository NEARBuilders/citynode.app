// @vitest-environment jsdom
import { CalendarDotsIcon } from "@phosphor-icons/react";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { DiscoveryLoadError } from "./discovery-load-error";

vi.mock("@/app", () => ({
  pluginHref: (path: string, search?: Record<string, string>) =>
    `${path}?redirect=${encodeURIComponent(search?.redirect ?? "")}`,
  pluginPath: (path: string) => path,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to: _to, ...props }: { children?: ReactNode; to?: string }) => (
    <a {...props}>{children}</a>
  ),
  useLocation: ({ select }: { select: (location: { href: string }) => string }) =>
    select({ href: "/nodes/n1/content" }),
}));

afterEach(cleanup);

function renderFailure(error: unknown, onRetry = vi.fn()) {
  render(
    <DiscoveryLoadError
      error={error}
      nodeId="n1"
      icon={CalendarDotsIcon}
      title="Couldn't load events"
      onRetry={onRetry}
    />,
  );
  return onRetry;
}

describe("DiscoveryLoadError", () => {
  it("asks an expired session to sign in again and come back", () => {
    renderFailure({ code: "UNAUTHORIZED" });

    expect(screen.getByTestId("community-session-expired")).toBeTruthy();
    expect(screen.getByTestId("community-session-sign-in").getAttribute("href")).toBe(
      "/login?redirect=%2Fnodes%2Fn1%2Fcontent",
    );
    expect(screen.queryByTestId("community-cannot-edit")).toBeNull();
  });

  it("shows the locked state when access is denied", () => {
    renderFailure({ status: 403 });

    expect(screen.getByTestId("community-cannot-edit")).toBeTruthy();
    expect(screen.queryByTestId("community-load-error")).toBeNull();
  });

  it("offers a retry for any other failure", () => {
    const onRetry = renderFailure(new TypeError("Failed to fetch"));

    expect(screen.getByTestId("community-load-error")).toBeTruthy();
    fireEvent.click(screen.getByTestId("community-load-error-retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
