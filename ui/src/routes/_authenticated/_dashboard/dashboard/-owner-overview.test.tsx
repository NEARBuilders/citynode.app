// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { OwnerOverview } from "./-owner-overview";

type Call<T> = () => Promise<T>;

const harness = vi.hoisted(() => ({
  activities: (async () => []) as () => Promise<unknown>,
  eventStatuses: (async () => []) as () => Promise<unknown>,
  monthlyStatuses: (async () => ({
    firstMonth: "2026-11",
    statuses: [],
  })) as () => Promise<unknown>,
  board: (async () => ({ canReview: true, teams: [], requests: [] })) as () => Promise<unknown>,
  onboarding: (async (month: string) => ({
    month,
    totals: { redeemed: 0, newMembers: 0 },
    organizations: [],
  })) as (month: string) => Promise<unknown>,
  monthlyReport: (async () => ({ stats: null })) as (month: string) => Promise<unknown>,
  checkIns: (async () => []) as (eventId: string) => Promise<unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => async () => {},
  Link: ({
    children,
    to,
    params,
    search,
    hash,
    className,
    "data-testid": testId,
  }: {
    children?: ReactNode;
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
    hash?: string;
    className?: string;
    "data-testid"?: string;
  }) => {
    const path = Object.entries(params ?? {}).reduce(
      (current, [key, value]) => current.replace(`$${key}`, value),
      to ?? "",
    );
    const query = new URLSearchParams(
      Object.entries(search ?? {}).filter((entry): entry is [string, string] => !!entry[1]),
    ).toString();
    return (
      <a
        href={`${path}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`}
        className={className}
        data-testid={testId}
      >
        {children}
      </a>
    );
  },
}));

vi.mock("@/app", () => ({
  useAuthClient: () => ({}),
  useApiClient: () => ({
    listDiscoveryActivities: () => harness.activities(),
    listEventReportStatuses: () => harness.eventStatuses(),
    listMonthlyReportStatuses: () => harness.monthlyStatuses(),
    getTeamJoinBoard: () => harness.board(),
    getDiscoveryNode: async () => ({ id: "node-1" }),
    getMonthlyReport: ({ month }: { month: string }) => harness.monthlyReport(month),
    auth: {
      getOnboardingStats: ({ month }: { month: string }) => harness.onboarding(month),
      listOnboardingCodes: ({ eventId }: { eventId: string }) => harness.checkIns(eventId),
    },
  }),
}));

const activity = (id: string, title: string, startsAt: string) => ({
  id,
  ownerNodeId: "node-1",
  nodeIds: ["node-1"],
  kind: "event",
  status: "published",
  title,
  summary: "",
  url: `https://example.com/${id}`,
  source: "manual",
  publishedAt: "2026-11-01T00:00:00.000Z",
  startsAt,
  endsAt: startsAt,
  venue: "Harbor hall",
});

const reported = activity("harbor", "Harbor meetup", "2026-12-05T18:00:00.000Z");
const unreported = activity("dock", "Dock talk", "2026-12-08T18:00:00.000Z");
const coming = activity("winter", "Winter social", "2026-12-20T18:00:00.000Z");

const failing = <T,>(failures: number, value: T): Call<T> => {
  let calls = 0;
  return () => {
    calls += 1;
    return calls <= failures ? Promise.reject(new Error("offline")) : Promise.resolve(value);
  };
};

function renderOverview(invitations: Parameters<typeof OwnerOverview>[0]["invitations"] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OwnerOverview
        community={{ nodeId: "node-1", organizationId: "org-1", name: "Harbor" }}
        invitations={invitations}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-10T12:00:00.000Z"));
  harness.activities = async () => [coming, unreported, reported];
  harness.eventStatuses = async () => [
    { activityId: "harbor", submittedAt: "2026-12-06T00:00:00.000Z", reviewedAt: null },
  ];
  harness.monthlyStatuses = async () => ({
    firstMonth: "2026-11",
    statuses: [
      {
        month: "2026-11",
        submittedAt: "2026-12-01T00:00:00.000Z",
        updatedAt: "2026-12-01T00:00:00.000Z",
        reviewedAt: "2026-12-02T00:00:00.000Z",
      },
    ],
  });
  harness.board = async () => ({
    canReview: true,
    teams: [],
    requests: [
      { id: "r1", status: "pending", canDecide: true, isMine: false },
      { id: "r2", status: "pending", canDecide: false, isMine: true },
      { id: "r3", status: "approved", canDecide: false, isMine: false },
    ],
  });
  harness.onboarding = async (month) => ({
    month,
    totals: month === "2026-12" ? { redeemed: 7, newMembers: 4 } : { redeemed: 3, newMembers: 2 },
    organizations: [],
  });
  harness.monthlyReport = async (month) => ({
    stats:
      month === "2026-12"
        ? { eventsHeld: 2, checkIns: 30, joins: 7, newMembers: 4 }
        : { eventsHeld: 1, checkIns: 12, joins: 3, newMembers: 2 },
  });
  harness.checkIns = async (eventId) => [
    { usedCount: eventId === "harbor" ? 12 : 5 },
    { usedCount: 0 },
  ];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("an owner's Home overview", () => {
  it("leads with reports, then what's waiting, events and onboarding", async () => {
    renderOverview();
    await screen.findByTestId("home-owner.waiting-heading");
    const order = [
      "home-owner.reports-heading",
      "home-owner.waiting-heading",
      "home-owner.events-heading",
      "home-owner.onboarding-heading",
    ].map((id) => screen.getByTestId(id));
    const follows = order
      .slice(1)
      .map((section, index) =>
        Boolean(
          (order[index]?.compareDocumentPosition(section) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
    expect(follows).toEqual([true, true, true]);
  });

  it("shows this month's and last month's report and the events still owed, each one click away", async () => {
    renderOverview();
    const december = await screen.findByTestId("home-owner.reports-list-month-2026-12");
    expect(december.textContent).toContain("December 2026 report");
    expect(screen.getByTestId("home-owner.reports-list-month-2026-12-open").textContent).toBe(
      "Start report",
    );
    expect(
      screen.getByTestId("home-owner.reports-list-month-2026-12-open").getAttribute("href"),
    ).toBe("/nodes/node-1/reports/2026-12");
    expect(screen.getByTestId("home-owner.reports-list-month-2026-11-reviewed")).toBeTruthy();
    expect(screen.getByTestId("home-owner.reports-list-event-dock").getAttribute("href")).toBe(
      "/nodes/node-1/events/dock/report",
    );
    expect(screen.queryByTestId("home-owner.reports-list-event-harbor")).toBeNull();
    expect(screen.getByTestId("home-owner.open-reports").getAttribute("href")).toBe("/report");
  });

  it("asks a community that started this month only for this month's report", async () => {
    harness.monthlyStatuses = async () => ({ firstMonth: "2026-12", statuses: [] });
    renderOverview();
    expect(await screen.findByTestId("home-owner.reports-list-month-2026-12")).toBeTruthy();
    expect(screen.queryByTestId("home-owner.reports-list-month-2026-11")).toBeNull();
  });

  it("shows a report load error with Retry", async () => {
    harness.monthlyStatuses = failing(1, { firstMonth: "2026-11", statuses: [] });
    renderOverview();
    const error = await screen.findByTestId("home-owner.reports-error");
    expect(screen.queryByTestId("home-owner.reports-list")).toBeNull();
    fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("home-owner.reports-list-month-2026-12")).toBeTruthy();
  });

  it("puts team requests waiting for a decision next to invitations", async () => {
    renderOverview();
    const row = await screen.findByTestId("home-owner.team-requests");
    expect(row.textContent).toContain("1 team request waiting");
    expect(screen.getByTestId("home-owner.team-requests-open").getAttribute("href")).toBe(
      "/dashboard/node#teams",
    );
  });

  it("leaves out Waiting on you when nothing is waiting, and retries a failed team read", async () => {
    harness.board = async () => ({ canReview: true, teams: [], requests: [] });
    renderOverview();
    await screen.findByTestId("home-owner.reports-list");
    expect(screen.queryByTestId("home-owner.waiting")).toBeNull();
    cleanup();

    harness.board = failing(1, {
      canReview: true,
      teams: [],
      requests: [{ id: "r1", status: "pending", canDecide: true, isMine: false }],
    });
    renderOverview();
    const error = await screen.findByTestId("home-owner.team-requests-error");
    fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("home-owner.team-requests")).toBeTruthy();
  });

  it("lists recent events with check-ins and report status, and what's coming up", async () => {
    renderOverview();
    const recent = await screen.findByTestId("home-owner.events-recent");
    expect(within(recent).getByTestId("report-status-dock").textContent).toBe("Report missing");
    expect(within(recent).getByTestId("report-status-harbor").textContent).toBe("Report in");
    expect(
      within(recent).getByTestId("report-status-dock").closest("a")?.getAttribute("href"),
    ).toBe("/nodes/node-1/events/dock/report");
    await waitFor(() =>
      expect(screen.getByTestId("home-owner.event-harbor-check-ins").textContent).toBe(
        "12 check-ins",
      ),
    );
    const upcoming = screen.getByTestId("home-owner.events-upcoming");
    expect(within(upcoming).getByTestId("home-owner.event-winter")).toBeTruthy();
    expect(within(upcoming).queryByTestId("home-owner.event-dock")).toBeNull();
    expect(screen.getByTestId("home-owner.all-events").getAttribute("href")).toBe(
      "/nodes/node-1/content?tab=events",
    );
  });

  it("shows Reviewed on an event report a platform admin has marked", async () => {
    harness.eventStatuses = async () => [
      {
        activityId: "harbor",
        submittedAt: "2026-12-06T00:00:00.000Z",
        reviewedAt: "2026-12-07T00:00:00.000Z",
      },
    ];
    renderOverview();
    const recent = await screen.findByTestId("home-owner.events-recent");
    expect(within(recent).getByTestId("report-status-harbor").textContent).toBe("Reviewed");
  });

  it("shows event and check-in load errors with Retry", async () => {
    harness.eventStatuses = failing(1, []);
    harness.checkIns = failing(2, [{ usedCount: 4 }]);
    renderOverview();
    const error = await screen.findByTestId("home-owner.events-error");
    expect(screen.queryByTestId("report-status-dock")).toBeNull();
    fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
    const checkIns = await screen.findByTestId("home-owner.event-dock-check-ins-error");
    expect(checkIns.textContent).not.toContain("0");
    fireEvent.click(within(checkIns).getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByTestId("home-owner.event-dock-check-ins").textContent).toBe("4 check-ins"),
    );
  });

  it("compares this month's joins, members, check-ins and events with last month", async () => {
    renderOverview();
    await waitFor(() =>
      expect(screen.getByTestId("home-owner.stat-joins").textContent).toContain("7"),
    );
    expect(screen.getByTestId("home-owner.stat-joins").textContent).toContain("3 last month");
    expect(screen.getByTestId("home-owner.stat-new-members").textContent).toContain("4");
    await waitFor(() =>
      expect(screen.getByTestId("home-owner.stat-check-ins").textContent).toContain(
        "12 last month",
      ),
    );
    expect(screen.getByTestId("home-owner.stat-check-ins").textContent).toContain("30");
    expect(screen.getByTestId("home-owner.stat-events-held").textContent).toContain("2");
  });

  it("shows onboarding load errors with Retry instead of zeros", async () => {
    harness.onboarding = (month) =>
      Promise.reject(new Error(`offline ${month}`)) as Promise<unknown>;
    const december = failing(1, {
      stats: { eventsHeld: 2, checkIns: 30, joins: 7, newMembers: 4 },
    });
    harness.monthlyReport = (month) =>
      month === "2026-12"
        ? december()
        : Promise.resolve({ stats: { eventsHeld: 1, checkIns: 12, joins: 3, newMembers: 2 } });
    renderOverview();
    expect(await screen.findByTestId("home-owner.stat-joins-error")).toBeTruthy();
    expect(screen.getByTestId("home-owner.stat-joins").textContent).not.toMatch(/\b0\b/);
    expect(screen.getByTestId("home-owner.stat-new-members-error")).toBeTruthy();
    const checkIns = await screen.findByTestId("home-owner.stat-check-ins-error");
    expect(checkIns).toBeTruthy();
    fireEvent.click(
      within(screen.getByTestId("home-owner.stat-check-ins")).getByRole("button", {
        name: "Try again",
      }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("home-owner.stat-check-ins").textContent).toContain("30"),
    );
  });

  it("leaves monthly report numbers out before reports start", async () => {
    vi.setSystemTime(new Date("2026-10-20T12:00:00.000Z"));
    renderOverview();
    await waitFor(() =>
      expect(screen.getByTestId("home-owner.stat-joins").textContent).toContain("3"),
    );
    expect(screen.queryByTestId("home-owner.stat-check-ins")).toBeNull();
    expect(screen.queryByTestId("home-owner.reports-list-month-2026-10")).toBeNull();
  });
});
