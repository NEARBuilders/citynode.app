// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { Route } from "./reports";

const harness = vi.hoisted(() => ({
  search: {} as { month?: string; show?: "missing" | "review" },
  months: [] as string[],
  reports: (() => Promise.resolve(null)) as () => Promise<unknown>,
  reviewed: [] as unknown[],
  copied: [] as string[],
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    ...options,
    useSearch: () => harness.search,
    useNavigate: () => async () => {},
  }),
  useRouteContext: () => ({}),
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
    search?: Record<string, string | undefined>;
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
      <a href={query ? `${path}?${query}` : path} data-testid={testId}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/app", () => ({
  getActiveRuntime: () => undefined,
  useApiClient: () => ({
    getAdminMonthlyReports: ({ month }: { month: string }) => {
      harness.months.push(month);
      return harness.reports();
    },
    reviewMonthlyReport: async (input: unknown) => {
      harness.reviewed.push(input);
      return { reviewedAt: "2026-12-10T12:00:00.000Z" };
    },
  }),
}));

const stats = { eventsHeld: 3, checkIns: 41, joins: 12, newMembers: 5 };
const row = (nodeId: string, name: string, status: "missing" | "submitted" | "reviewed") => ({
  organizationId: `org-${nodeId}`,
  slug: name.toLowerCase(),
  name,
  nodeId,
  status,
  report:
    status === "missing"
      ? null
      : {
          submittedAt: "2026-12-01T00:00:00.000Z",
          submittedByName: "Adaeze",
          updatedAt: "2026-12-01T00:00:00.000Z",
          reviewedAt: status === "reviewed" ? "2026-12-02T00:00:00.000Z" : null,
          stats,
        },
  events: { ended: 3, reported: status === "missing" ? 1 : 3, toReview: 0 },
});

const lagos = row("node-lagos", "Lagos", "submitted");
const lisbon = row("node-lisbon", "Lisbon", "reviewed");
const manila = row("node-manila", "Manila", "missing");

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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-10T12:00:00.000Z"));
  harness.search = { month: "2026-11" };
  harness.months.length = 0;
  harness.reviewed.length = 0;
  harness.copied.length = 0;
  harness.reports = async () => ({ month: "2026-11", communities: [lagos, lisbon, manila] });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        harness.copied.push(text);
      },
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Admin → Reports", () => {
  it("shows each community's monthly report status, reported events and what to do next", async () => {
    renderPage();
    expect((await screen.findByTestId("admin-reports-summary")).textContent).toBe(
      "2 of 3 communities reported · 1 to review · 1 missing",
    );
    expect(harness.months).toEqual(["2026-11"]);
    expect(screen.getByTestId("admin-report-status-node-lagos").textContent).toBe("Report in");
    expect(screen.getByTestId("admin-report-status-node-lisbon").textContent).toBe("Reviewed");
    expect(screen.getByTestId("admin-report-status-node-manila").textContent).toBe(
      "Report missing",
    );
    expect(screen.getByTestId("admin-report-read-node-lagos").getAttribute("href")).toBe(
      "/nodes/node-lagos/reports/2026-11",
    );
    expect(screen.getByTestId("admin-report-review-node-lisbon").textContent).toBe(
      "Mark not reviewed",
    );
    expect(screen.getByTestId("admin-report-events-node-manila").getAttribute("href")).toBe(
      "/admin/events?community=node-manila&month=2026-11&report=missing",
    );
    expect(screen.getByTestId("admin-report-events-node-manila").textContent).toBe(
      "1 of 3 reported",
    );
    expect(screen.queryByTestId("admin-report-copy-node-lagos")).toBeNull();

    fireEvent.click(screen.getByTestId("admin-report-copy-node-manila"));
    await waitFor(() => expect(harness.copied).toHaveLength(1));
    expect(harness.copied[0]).toMatch(/\/report\?community=manila$/);

    fireEvent.click(screen.getByTestId("admin-report-review-node-lagos"));
    await waitFor(() =>
      expect(harness.reviewed).toEqual([
        { nodeId: "node-lagos", month: "2026-11", reviewed: true },
      ]),
    );
  });

  it("opens on the current month, where a report not in yet isn't missing", async () => {
    harness.search = {};
    harness.reports = async () => ({ month: "2026-12", communities: [manila] });
    renderPage();
    expect((await screen.findByTestId("admin-report-status-node-manila")).textContent).toBe(
      "Not in yet",
    );
    expect(harness.months).toEqual(["2026-12"]);
  });

  it("filters to missing reports, or to reports waiting for review", async () => {
    harness.search = { month: "2026-11", show: "missing" };
    renderPage();
    await screen.findByTestId("admin-report-node-manila");
    expect(screen.queryByTestId("admin-report-node-lagos")).toBeNull();

    cleanup();
    harness.search = { month: "2026-11", show: "review" };
    renderPage();
    await screen.findByTestId("admin-report-node-lagos");
    expect(screen.queryByTestId("admin-report-node-lisbon")).toBeNull();
    expect(screen.queryByTestId("admin-report-node-manila")).toBeNull();
  });

  it("shows a load error with Retry, never an empty list", async () => {
    let calls = 0;
    harness.reports = () => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error("offline"))
        : Promise.resolve({ month: "2026-11", communities: [lagos] });
    };
    renderPage();
    const error = await screen.findByTestId("admin-reports-error");
    expect(screen.queryByTestId("admin-reports-summary")).toBeNull();
    fireEvent.click(error.querySelector("button") as HTMLButtonElement);
    expect(await screen.findByTestId("admin-report-node-lagos")).toBeTruthy();
  });

  it("only accepts months from November 2026 to now", () => {
    const validate = (
      Route as unknown as {
        options: { validateSearch: (search: Record<string, unknown>) => { month?: string } };
      }
    ).options.validateSearch;
    expect(validate({ month: "2026-11" }).month).toBe("2026-11");
    expect(validate({ month: "2026-10" }).month).toBeUndefined();
    expect(validate({ month: "2027-01" }).month).toBeUndefined();
    expect(validate({ month: "november" }).month).toBeUndefined();
  });
});
