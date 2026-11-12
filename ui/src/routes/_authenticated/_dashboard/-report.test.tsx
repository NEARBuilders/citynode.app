// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { utcMonth } from "@/lib/queries/onboarding-joins";
import { Route } from "./report";

const harness = vi.hoisted(() => ({
  search: {} as { community?: string },
  activeOrganizationId: "org-harbor" as string | null,
  listed: (() => Promise.resolve({ communities: [], memberships: 0 })) as () => Promise<unknown>,
  opened: [] as Array<string | null>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    ...options,
    useSearch: () => harness.search,
    useRouteContext: () => ({ auth: { activeOrganizationId: harness.activeOrganizationId } }),
  }),
  redirect: (options: unknown) => ({ redirect: options }),
  Link: ({
    children,
    to,
    params,
    search,
    "data-testid": testId,
  }: {
    children?: ReactNode;
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, string>;
    "data-testid"?: string;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (current, [key, value]) => current.replace(`$${key}`, value),
      to ?? "",
    );
    const query = new URLSearchParams(search ?? {}).toString();
    return (
      <a href={query ? `${path}?${query}` : path} data-testid={testId}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/components/layout/use-open-sole-community", () => ({
  useOpenSoleCommunity: (organizationId: string | null) => {
    harness.opened.push(organizationId);
  },
}));

vi.mock("@/app", () => ({
  useApiClient: () => ({
    listReportCommunities: () => harness.listed(),
    listDiscoveryActivities: async () => [
      {
        id: "event-missing",
        title: "Builders Night",
        kind: "event",
        status: "published",
        publishedAt: "2020-01-01T00:00:00.000Z",
        startsAt: "2020-01-01T16:00:00.000Z",
        endsAt: "2020-01-01T18:00:00.000Z",
        venue: "Town Hall",
      },
    ],
    listEventReportStatuses: async () => [],
    listMonthlyReportStatuses: async () => [
      { month: utcMonth(-1), submittedAt: "2026-11-01T00:00:00.000Z" },
    ],
  }),
}));

const harbor = { organizationId: "org-harbor", slug: "harbor", name: "Harbor", nodeId: "node-h" };
const alder = { organizationId: "org-alder", slug: "alder", name: "Alder", nodeId: "node-a" };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Page = (Route as unknown as { component: ComponentType }).component;
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  harness.search = {};
  harness.activeOrganizationId = "org-harbor";
  harness.opened.length = 0;
});
afterEach(cleanup);

describe("/report", () => {
  it("sends platform admins to their view of missing reports", () => {
    const beforeLoad = (Route as unknown as { options: { beforeLoad: (args: unknown) => void } })
      .options.beforeLoad;
    expect(() => beforeLoad({ context: { auth: { user: { role: "admin" } } } })).toThrow(
      expect.objectContaining({
        redirect: { to: "/admin/events", search: { report: "missing" } },
      }),
    );
    expect(() => beforeLoad({ context: { auth: { user: { role: null } } } })).not.toThrow();
  });

  it("shows the only community's monthly reports and the events still missing one", async () => {
    harness.listed = async () => ({ communities: [harbor], memberships: 2 });
    renderPage();
    const list = await screen.findByTestId("report.list");
    expect(list.textContent).toContain("Builders Night");
    expect(screen.getByTestId(`report.list-month-${utcMonth(-1)}`).textContent).toContain(
      "Report in",
    );
    expect(screen.getByTestId(`report.list-month-${utcMonth(0)}-open`).getAttribute("href")).toBe(
      `/nodes/node-h/reports/${utcMonth(0)}`,
    );
    expect(screen.getByTestId("report.list-event-event-missing").getAttribute("href")).toBe(
      "/nodes/node-h/events/event-missing/report",
    );
    expect(screen.queryByTestId("report.switch")).toBeNull();
    expect(screen.getByTestId("report.guide").getAttribute("href")).toBe("/docs/report-each-month");
  });

  it("opens the person's community first when another one is active", async () => {
    harness.activeOrganizationId = "org-other";
    harness.listed = async () => ({ communities: [harbor], memberships: 2 });
    renderPage();
    await waitFor(() => expect(harness.opened).toContain("org-harbor"));
    expect(screen.getByTestId("report.loading")).toBeTruthy();
    expect(screen.queryByTestId("report.list")).toBeNull();
  });

  it("asks which community when the person reports for several", async () => {
    harness.listed = async () => ({ communities: [alder, harbor], memberships: 2 });
    renderPage();
    await screen.findByTestId("report.choose");
    expect(screen.getByTestId("report.community-alder").getAttribute("href")).toBe(
      "/report?community=alder",
    );
    expect(screen.getByTestId("report.community-harbor").getAttribute("href")).toBe(
      "/report?community=harbor",
    );
    expect(harness.opened.every((id) => id === null)).toBe(true);
  });

  it("remembers the chosen community from the link", async () => {
    harness.search = { community: "harbor" };
    harness.listed = async () => ({ communities: [alder, harbor], memberships: 2 });
    renderPage();
    await screen.findByTestId("report.list");
    expect(screen.getByTestId("report.heading").textContent).toContain("Harbor");
    expect(screen.getByTestId("report.switch").getAttribute("href")).toBe("/report");
  });

  it("explains, without an error, when the person can't report", async () => {
    harness.listed = async () => ({ communities: [], memberships: 1 });
    renderPage();
    expect((await screen.findByText("Reports come from owners and organizers")).textContent).toBe(
      "Reports come from owners and organizers",
    );
    expect(screen.getByTestId("report.none-action").getAttribute("href")).toBe("/dashboard/node");

    cleanup();
    harness.listed = async () => ({ communities: [], memberships: 0 });
    renderPage();
    await screen.findByText("You're not in a community yet");
    expect(screen.getByTestId("report.none-action").getAttribute("href")).toBe("/explore");
  });

  it("shows a load error with Retry", async () => {
    harness.listed = () => Promise.reject(new Error("offline"));
    renderPage();
    await screen.findByText("Couldn't load your communities.");
    expect(screen.getByTestId("report.retry").textContent).toBe("Try again");
  });
});
