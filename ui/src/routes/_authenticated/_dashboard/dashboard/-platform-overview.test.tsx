// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { PlatformOverview } from "./-platform-overview";

const harness = vi.hoisted(() => ({
  monthly: (async () => ({ month: "", communities: [] })) as (month: string) => Promise<unknown>,
  events: (async () => ({ events: [] })) as () => Promise<unknown>,
  reviewed: [] as unknown[],
  failingJoinMonths: new Set<string>(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouteContext: () => ({}),
  Link: ({
    children,
    to,
    params,
    search,
    className,
    "data-testid": testId,
  }: {
    children?: ReactNode;
    to?: string;
    params?: Record<string, string>;
    search?: Record<string, string | undefined>;
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
      <a href={query ? `${path}?${query}` : path} className={className} data-testid={testId}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/app", () => ({
  getActiveRuntime: () => undefined,
  useAuthClient: () => ({}),
  useApiClient: () => ({
    getAdminMonthlyReports: ({ month }: { month: string }) => harness.monthly(month),
    getAdminEvents: () => harness.events(),
    reviewMonthlyReport: async (input: unknown) => {
      harness.reviewed.push(input);
      return { reviewedAt: "2026-12-26T12:00:00.000Z" };
    },
    reviewEventReport: async (input: unknown) => {
      harness.reviewed.push(input);
      return { reviewedAt: "2026-12-26T12:00:00.000Z" };
    },
    listTenants: async () => [],
    listNodes: async () => [],
    getDiscoveryEventStats: async () => [],
    getPlatformAttendance: async ({ month }: { month: string }) => ({
      month,
      people: 9,
      returning: 4,
    }),
    getCommunityEngagement: async () => ({ communities: [] }),
    proposals: { getProposals: async () => ({ data: [], meta: { total: 0 } }) },
    auth: {
      getOnboardingStats: async ({ month }: { month: string }) => {
        if (harness.failingJoinMonths.has(month)) throw new Error("offline");
        return { month, totals: { redeemed: 14, newMembers: 6 }, organizations: [] };
      },
    },
  }),
}));

vi.mock("@/lib/use-relayer", () => ({
  useRelayerInfoQuery: () => ({ data: null, isLoading: false, isError: false }),
}));

vi.mock("@/routes/_admin/_dashboard/admin/-community-join-chart", () => ({
  CommunityJoinTrend: () => <div data-testid="admin-joins-chart" />,
}));

const stats = { eventsHeld: 2, checkIns: 30, joins: 9, newMembers: 4 };
const community = (name: string, status: "missing" | "submitted" | "reviewed") => ({
  organizationId: `org-${name.toLowerCase()}`,
  slug: name.toLowerCase(),
  name,
  nodeId: `node-${name.toLowerCase()}`,
  status,
  report:
    status === "missing"
      ? null
      : {
          submittedAt: "2026-12-20T00:00:00.000Z",
          submittedByName: "Adaeze",
          updatedAt: "2026-12-20T00:00:00.000Z",
          reviewedAt: status === "reviewed" ? "2026-12-21T00:00:00.000Z" : null,
          stats,
        },
  events: { ended: 1, reported: status === "missing" ? 0 : 1, toReview: 0 },
});

const event = (
  id: string,
  nodeName: string,
  startsAt: string,
  report: { submittedAt: string | null; reviewedAt: string | null },
) => ({
  id,
  title: `${nodeName} meetup`,
  url: `https://example.com/${id}`,
  startsAt,
  endsAt: startsAt,
  nodeId: `node-${nodeName.toLowerCase()}`,
  nodeName,
  publicPage: true,
  organizationId: `org-${nodeName.toLowerCase()}`,
  reportSubmittedAt: report.submittedAt,
  reportUpdatedAt: report.submittedAt,
  reportReviewedAt: report.reviewedAt,
  checkIns: null,
});

const reported = event("lagos-dec", "Lagos", "2026-12-05T18:00:00.000Z", {
  submittedAt: "2026-12-06T00:00:00.000Z",
  reviewedAt: null,
});
const unreported = event("manila-dec", "Manila", "2026-12-10T18:00:00.000Z", {
  submittedAt: null,
  reviewedAt: null,
});
const upcoming = event("lisbon-jan", "Lisbon", "2027-01-05T18:00:00.000Z", {
  submittedAt: null,
  reviewedAt: null,
});

function renderOverview() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformOverview />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-26T12:00:00.000Z"));
  harness.reviewed.length = 0;
  harness.failingJoinMonths.clear();
  harness.monthly = async (month) => ({
    month,
    communities:
      month === "2026-12"
        ? [community("Lagos", "submitted"), community("Manila", "missing")]
        : [community("Lagos", "reviewed"), community("Manila", "missing")],
  });
  harness.events = async () => ({ events: [upcoming, unreported, reported] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a platform admin's Home", () => {
  it("leads with reports, then Needs action, events, onboarding and community progress", async () => {
    renderOverview();
    await screen.findByTestId("home-admin.review-list");
    const order = [
      "home-admin.reports-heading",
      "admin.section.needs-action",
      "home-admin.events-heading",
      "admin.section.joins",
      "admin.section.progress",
    ].map((id) => screen.getByTestId(id));
    const follows = order
      .slice(1)
      .map((section, index) =>
        Boolean(
          (order[index]?.compareDocumentPosition(section) ?? 0) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
    expect(follows).toEqual([true, true, true, true]);
  });

  it("shows this month's and last month's reports, what is missing, and what to review", async () => {
    renderOverview();
    const december = await screen.findByTestId("home-admin.month-2026-12");
    await waitFor(() => expect(december.textContent).toContain("1/2"));
    expect(screen.getByTestId("home-admin.month-2026-11").textContent).toContain("1/2");
    expect(screen.getByTestId("home-admin.missing-2026-12").getAttribute("href")).toBe(
      "/admin/reports?month=2026-12&show=missing",
    );
    expect(screen.getByTestId("home-admin.missing-2026-12").textContent).toBe(
      "1 community not in yet",
    );
    expect(screen.getByTestId("home-admin.missing-2026-11").textContent).toBe(
      "1 community missing",
    );
    expect(screen.getByTestId("home-admin.events-missing-2026-12").textContent).toBe(
      "1 event report missing",
    );
    await waitFor(() =>
      expect(screen.getByTestId("home-admin.to-review").textContent).toContain("2"),
    );

    const list = screen.getByTestId("home-admin.review-list");
    expect(
      within(list).getByTestId("home-admin.review-monthly-node-lagos-2026-12").textContent,
    ).toContain("Lagos: December 2026 report");
    expect(within(list).getByTestId("home-admin.review-event-lagos-dec")).toBeTruthy();

    fireEvent.click(screen.getByTestId("home-admin.review-monthly-node-lagos-2026-12-mark"));
    fireEvent.click(screen.getByTestId("home-admin.review-event-lagos-dec-mark"));
    await waitFor(() =>
      expect(harness.reviewed).toEqual([
        {
          nodeId: "node-lagos",
          month: "2026-12",
          reviewed: true,
          updatedAt: "2026-12-20T00:00:00.000Z",
        },
        { activityId: "lagos-dec", reviewed: true, updatedAt: reported.reportUpdatedAt },
      ]),
    );
  });

  it("asks to chase each community missing a report, with a link to copy", async () => {
    renderOverview();
    const chase = await screen.findByTestId("admin-needs-action-reports-org-manila");
    expect(chase.textContent).toContain("Remind Manila to report");
    expect(chase.textContent).toContain("November 2026 report not in");
    expect(chase.textContent).toContain("December 2026 report not in");
    expect(chase.textContent).toContain("1 event report overdue");
    expect(screen.getByTestId("admin-needs-action-copy-org-manila").textContent).toBe(
      "Copy report link",
    );
    expect(screen.queryByTestId("admin-needs-action-reports-org-lagos")).toBeNull();
  });

  it("lists recent events with their report status and what's coming up", async () => {
    renderOverview();
    const recent = await screen.findByTestId("home-admin.events-recent");
    expect(within(recent).getByTestId("report-status-lagos-dec").textContent).toBe("Report in");
    expect(within(recent).getByTestId("report-status-manila-dec").textContent).toBe(
      "Report missing",
    );
    expect(
      within(screen.getByTestId("home-admin.events-upcoming")).getByTestId(
        "home-admin.event-lisbon-jan",
      ),
    ).toBeTruthy();
  });

  it("shows onboarding this month against last month", async () => {
    renderOverview();
    await waitFor(() =>
      expect(screen.getByTestId("admin.stat.redeemed").textContent).toContain("14"),
    );
    expect(screen.getByTestId("admin.stat.returning").textContent).toContain("4");
    expect(screen.getByTestId("admin-joins-chart")).toBeTruthy();
  });

  it("shows the joins table's load error with Retry when only last month fails", async () => {
    harness.failingJoinMonths.add("2026-11");
    renderOverview();
    await waitFor(() =>
      expect(screen.getByTestId("admin.stat.redeemed").textContent).toContain("14"),
    );
    fireEvent.click(screen.getByTestId("admin-joins-table-toggle"));
    const error = await screen.findByTestId("admin-joins-table-error");

    harness.failingJoinMonths.clear();
    fireEvent.click(within(error).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByTestId("admin-joins-table-error")).toBeNull());
    expect(screen.getByText("No communities yet")).toBeTruthy();
  });

  it("shows load errors with Retry instead of zeros", async () => {
    let monthlyCalls = 0;
    harness.monthly = (month) => {
      monthlyCalls += 1;
      return monthlyCalls <= 2
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ month, communities: [community("Lagos", "submitted")] });
    };
    let eventCalls = 0;
    harness.events = () => {
      eventCalls += 1;
      return eventCalls === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ events: [reported] });
    };
    renderOverview();

    expect(await screen.findByTestId("home-admin.month-2026-12-error")).toBeTruthy();
    expect(screen.getByTestId("home-admin.month-2026-12").textContent).not.toContain("0/");
    expect(screen.getByTestId("home-admin.to-review-error")).toBeTruthy();
    expect(screen.getByTestId("admin-needs-action-error")).toBeTruthy();
    const eventsError = screen.getByTestId("home-admin.events-error");

    fireEvent.click(within(eventsError).getByRole("button", { name: "Try again" }));
    fireEvent.click(
      within(screen.getByTestId("home-admin.to-review")).getByRole("button", {
        name: "Try again",
      }),
    );
    expect(await screen.findByTestId("home-admin.review-list")).toBeTruthy();
    expect(screen.queryByTestId("home-admin.events-error")).toBeNull();
  });
});
