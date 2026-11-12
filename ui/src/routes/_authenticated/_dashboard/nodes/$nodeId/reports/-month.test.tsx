// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { Route } from "./$month";

const NODE = "node-h";
const MONTH = "2026-11";

const harness = vi.hoisted(() => ({
  report: (() => Promise.resolve(null)) as () => Promise<unknown>,
  saved: [] as unknown[],
  reviewed: [] as unknown[],
  month: "2026-11",
  navigate: vi.fn(async () => {}),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    ...options,
    useParams: () => ({ nodeId: NODE, month: harness.month }),
  }),
  Link: ({
    children,
    to,
    params,
    search,
    "data-testid": testId,
  }: {
    children?: ReactNode;
    to?: string;
    params?: { guide?: string };
    search?: Record<string, string>;
    "data-testid"?: string;
  }) => {
    const path = to?.replace("$guide", params?.guide ?? "") ?? "";
    const query = new URLSearchParams(search ?? {}).toString();
    return (
      <a href={query ? `${path}?${query}` : path} data-testid={testId}>
        {children}
      </a>
    );
  },
  useRouteContext: () => ({}),
  useNavigate: () => harness.navigate,
}));

vi.mock("@/app", () => ({
  useApiClient: () => ({
    getMonthlyReport: () => harness.report(),
    getNode: async () => ({ id: NODE, name: "Harbor" }),
    saveMonthlyReport: async (input: unknown) => {
      harness.saved.push(input);
      return {};
    },
    reviewMonthlyReport: async (input: unknown) => {
      harness.reviewed.push(input);
      return { reviewedAt: "2026-12-03T00:00:00.000Z" };
    },
    listReportCommunities: async () => ({
      communities: [{ organizationId: "org-h", slug: "harbor", name: "Harbor", nodeId: NODE }],
      memberships: 1,
    }),
  }),
}));

const stats = { eventsHeld: 3, checkIns: 41, joins: 12, newMembers: 5 };
const stored = {
  nodeId: NODE,
  month: MONTH,
  notes: "Two meetups and a hackathon.",
  stats: { eventsHeld: 2, checkIns: 30, joins: 9, newMembers: 4 },
  submittedBy: "owner-1",
  submittedAt: "2026-12-01T00:00:00.000Z",
  updatedAt: "2026-12-02T00:00:00.000Z",
  reviewedAt: null,
};
const closesAt = "2027-01-01T00:00:00.000Z";
const owner = { canEdit: true, canReview: false };

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
  harness.saved.length = 0;
  harness.reviewed.length = 0;
  harness.month = MONTH;
  harness.navigate.mockClear();
});
afterEach(cleanup);

describe("monthly report form", () => {
  it("shows the month's numbers and returns to /report after submitting", async () => {
    harness.report = async () => ({ report: null, ...owner, open: true, closesAt, stats });
    renderPage();
    expect((await screen.findByTestId("monthly-report.checkIns")).textContent).toContain("41");
    expect(screen.getByTestId("monthly-report.heading").textContent).toContain(
      "November 2026 report",
    );
    expect(screen.getByTestId("monthly-report.guide").getAttribute("href")).toBe(
      "/docs/report-each-month",
    );

    fireEvent.click(screen.getByTestId("monthly-report.submit"));
    expect(await screen.findByText("Required")).toBeTruthy();
    expect(harness.saved).toEqual([]);

    fireEvent.change(screen.getByTestId("monthly-report.notes-input"), {
      target: { value: "  A busy month.  " },
    });
    fireEvent.click(screen.getByTestId("monthly-report.submit"));
    await waitFor(() =>
      expect(harness.navigate).toHaveBeenCalledWith({
        to: "/report",
        search: { community: "harbor" },
      }),
    );
    expect(harness.saved).toEqual([{ nodeId: NODE, month: MONTH, notes: "A busy month." }]);
  });

  it("reopens a submitted report for editing", async () => {
    harness.report = async () => ({ report: stored, ...owner, open: true, closesAt, stats });
    renderPage();
    const notes = (await screen.findByTestId("monthly-report.notes-input")) as HTMLTextAreaElement;
    expect(notes.value).toBe("Two meetups and a hackathon.");
    expect(screen.getByTestId("monthly-report.submit").textContent).toBe("Save changes");
    expect(screen.queryByTestId("monthly-report.reviewed-on")).toBeNull();
    expect(screen.queryByTestId("monthly-report.review")).toBeNull();
  });

  it("tells the owner their report was reviewed", async () => {
    harness.report = async () => ({
      report: { ...stored, reviewedAt: "2026-12-03T00:00:00.000Z" },
      ...owner,
      open: true,
      closesAt,
      stats,
    });
    renderPage();
    expect((await screen.findByTestId("monthly-report.reviewed-on")).textContent).toContain(
      "Reviewed",
    );
    expect(screen.queryByTestId("monthly-report.review")).toBeNull();
  });

  it("shows platform admins the report and its saved numbers without the form", async () => {
    harness.report = async () => ({
      report: stored,
      canEdit: false,
      canReview: true,
      open: true,
      closesAt,
      stats: stored.stats,
    });
    renderPage();
    expect((await screen.findByTestId("monthly-report.notes")).textContent).toContain(
      "Two meetups and a hackathon.",
    );
    expect(screen.getByTestId("monthly-report.checkIns").textContent).toContain("30");
    expect(screen.queryByTestId("monthly-report.notes-input")).toBeNull();
    expect(screen.queryByTestId("monthly-report.closed")).toBeNull();
    expect(screen.getByTestId("monthly-report.back").getAttribute("href")).toBe(
      `/admin/reports?month=${MONTH}`,
    );

    fireEvent.click(screen.getByTestId("monthly-report.review"));
    await waitFor(() =>
      expect(harness.reviewed).toEqual([{ nodeId: NODE, month: MONTH, reviewed: true }]),
    );
  });

  it("lets a platform admin take a review back", async () => {
    harness.report = async () => ({
      report: { ...stored, reviewedAt: "2026-12-03T00:00:00.000Z" },
      canEdit: false,
      canReview: true,
      open: true,
      closesAt,
      stats: stored.stats,
    });
    renderPage();
    const button = await screen.findByTestId("monthly-report.review");
    expect(button.textContent).toBe("Mark not reviewed");
    fireEvent.click(button);
    await waitFor(() =>
      expect(harness.reviewed).toEqual([{ nodeId: NODE, month: MONTH, reviewed: false }]),
    );
  });

  it("is read-only once the following month has ended", async () => {
    harness.report = async () => ({
      report: stored,
      ...owner,
      open: false,
      closesAt,
      stats: stored.stats,
    });
    renderPage();
    expect((await screen.findByTestId("monthly-report.closed")).textContent).toBe(
      "This report closed at the end of December 2026.",
    );
    expect(screen.queryByTestId("monthly-report.notes-input")).toBeNull();
  });

  it("has no report for a month before November 2026", async () => {
    harness.month = "2026-10";
    harness.report = async () => ({ report: null, ...owner, open: true, closesAt, stats });
    renderPage();
    expect(await screen.findByText("This isn't a report month.")).toBeTruthy();
    expect(screen.queryByTestId("monthly-report.notes-input")).toBeNull();
  });

  it("shows a load error with Retry", async () => {
    harness.report = () => Promise.reject(new Error("offline"));
    renderPage();
    expect((await screen.findByTestId("monthly-report.retry")).textContent).toBe("Try again");
  });
});
