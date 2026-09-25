// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Tabs } from "@/components";
import { OnboardingTab } from "./-onboarding-tab";

vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ href: "/orgs/acme?tab=onboard" }),
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    children: ReactNode;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (href, [key, value]) => href.replace(`$${key}`, value),
      to,
    );
    const query = new URLSearchParams(search).toString();
    return (
      <a href={query ? `${path}?${query}` : path} {...props}>
        {children}
      </a>
    );
  },
}));

const HOUR = 3_600_000;

function codeSummary(overrides: Record<string, unknown>) {
  return {
    id: "code-active",
    eventId: "event-1",
    eventName: "Launch Night",
    teamId: "team-1",
    role: "member",
    maxUses: 50,
    usedCount: 3,
    expiresAt: new Date(Date.now() + 24 * HOUR),
    revokedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const codes = [
  codeSummary({}),
  codeSummary({
    id: "code-expired",
    eventName: "Last Week",
    expiresAt: new Date(Date.now() - HOUR),
  }),
  codeSummary({ id: "code-revoked", eventName: "Cancelled", revokedAt: new Date() }),
  codeSummary({ id: "code-full", eventName: "Tiny Room", maxUses: 3 }),
];

function renderTab() {
  const apiClient = {
    auth: {
      listOnboardingCodes: vi.fn().mockResolvedValue(codes),
      getOnboardingStatus: vi.fn().mockResolvedValue({
        ...codes[0],
        joined: [
          { userId: "user-1", userName: "First Member", accountId: "0sabc", createdAt: new Date() },
        ],
      }),
      revokeOnboardingCode: vi.fn().mockResolvedValue({ success: true }),
    },
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Tabs value="onboard">
        <OnboardingTab apiClient={apiClient as never} canManage orgId="org-1" />
      </Tabs>
    </QueryClientProvider>,
  );
  return { apiClient };
}

afterEach(cleanup);

describe("OnboardingTab", () => {
  it("no longer offers a free-text event name form", async () => {
    renderTab();

    await waitFor(() => expect(screen.getByTestId("onboard.code-code-active")).toBeTruthy());
    expect(screen.queryByTestId("onboard.event-name-input")).toBeNull();
    expect(screen.getByTestId("onboard.start-from-event").textContent).toMatch(/event/i);
  });

  it("shows each code's state", async () => {
    renderTab();

    await waitFor(() => expect(screen.getByTestId("onboard.code-state-code-active")).toBeTruthy());
    expect(screen.getByTestId("onboard.code-state-code-active").textContent).toBe("3/50 joined");
    expect(screen.getByTestId("onboard.code-state-code-expired").textContent).toBe("expired");
    expect(screen.getByTestId("onboard.code-state-code-revoked").textContent).toBe("revoked");
    expect(screen.getByTestId("onboard.code-state-code-full").textContent).toBe("used up");
  });

  it("links only active codes to their station", async () => {
    renderTab();

    await waitFor(() =>
      expect(screen.getByTestId("onboard.open-station-code-active")).toBeTruthy(),
    );
    expect(screen.getByTestId("onboard.open-station-code-active").getAttribute("href")).toBe(
      "/onboarding/station/code-active?org=org-1&from=%2Forgs%2Facme%3Ftab%3Donboard",
    );
    expect(screen.queryByTestId("onboard.open-station-code-expired")).toBeNull();
    expect(screen.queryByTestId("onboard.open-station-code-revoked")).toBeNull();
    expect(screen.queryByTestId("onboard.open-station-code-full")).toBeNull();
  });

  it("shows live joined status for a selected code", async () => {
    renderTab();

    await waitFor(() => expect(screen.getByTestId("onboard.code-code-active")).toBeTruthy());
    fireEvent.click(screen.getByTestId("onboard.code-code-active"));

    await waitFor(() =>
      expect(screen.getByTestId("onboard.joined-list").textContent).toContain("First Member"),
    );
  });
});
