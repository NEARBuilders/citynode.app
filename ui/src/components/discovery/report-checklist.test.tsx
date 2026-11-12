// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { ReportChecklist } from "./report-checklist";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    "data-testid": testId,
  }: {
    children?: ReactNode;
    to?: string;
    params?: Record<string, string>;
    "data-testid"?: string;
  }) => {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to ?? "",
    );
    return (
      <a href={href} data-testid={testId}>
        {children}
      </a>
    );
  },
}));

const now = Date.parse("2026-12-05T12:00:00.000Z");

function activity(id: string, title: string, ended: boolean) {
  return {
    id,
    title,
    kind: "event" as const,
    status: "published" as const,
    publishedAt: "2026-01-01T00:00:00.000Z",
    startsAt: ended ? "2026-11-01T16:00:00.000Z" : "2027-01-01T16:00:00.000Z",
    endsAt: ended ? "2026-11-01T18:00:00.000Z" : "2027-01-01T18:00:00.000Z",
    venue: "Town Hall",
  };
}

const missing = activity("event-missing", "Builders Night", true);
const submitted = activity("event-done", "Office Hours", true);
const upcoming = activity("event-next", "Next Meetup", false);

afterEach(cleanup);

function renderList(props: Partial<Parameters<typeof ReportChecklist>[0]> = {}) {
  return render(
    <ReportChecklist
      nodeId="node-1"
      now={now}
      testId="list"
      monthlyStatuses={[]}
      activities={[upcoming, submitted, missing]}
      eventStatuses={[{ activityId: submitted.id, submittedAt: "2026-11-02T00:00:00.000Z" }]}
      {...props}
    />,
  );
}

describe("ReportChecklist", () => {
  it("lists this month's and last month's reports, each one click from its form", () => {
    renderList({
      monthlyStatuses: [{ month: "2026-11", submittedAt: "2026-12-01T00:00:00.000Z" }],
    });
    const december = screen.getByTestId("list-month-2026-12");
    expect(december.textContent).toContain("December 2026 report");
    expect(december.textContent).toContain("until the end of January 2027");
    expect(screen.getByTestId("list-month-2026-12-open").textContent).toBe("Start report");
    expect(screen.getByTestId("list-month-2026-12-open").getAttribute("href")).toBe(
      "/nodes/node-1/reports/2026-12",
    );
    expect(screen.getByTestId("list-month-2026-11").textContent).toContain("Report in");
    expect(screen.getByTestId("list-month-2026-11-open").textContent).toBe("Edit report");
  });

  it("marks last month missing until it is submitted, and says when it was reviewed", () => {
    const { rerender } = renderList();
    expect(screen.getByTestId("list-month-2026-11").textContent).toContain("Report missing");
    expect(screen.getByTestId("list-month-2026-12").textContent).not.toContain("Report missing");

    rerender(
      <ReportChecklist
        nodeId="node-1"
        now={now}
        testId="list"
        monthlyStatuses={[
          {
            month: "2026-11",
            submittedAt: "2026-12-01T00:00:00.000Z",
            reviewedAt: "2026-12-03T00:00:00.000Z",
          },
        ]}
        activities={[]}
        eventStatuses={[]}
      />,
    );
    expect(screen.getByTestId("list-month-2026-11-reviewed").textContent).toBe("Reviewed");
  });

  it("starts with November 2026", () => {
    render(
      <ReportChecklist
        nodeId="node-1"
        now={Date.parse("2026-11-12T12:00:00.000Z")}
        testId="list"
        monthlyStatuses={[]}
        activities={[]}
        eventStatuses={[]}
      />,
    );
    expect(screen.getByTestId("list-month-2026-11")).toBeTruthy();
    expect(screen.queryByTestId("list-month-2026-10")).toBeNull();
  });

  it("lists ended events with a missing report until one is submitted", () => {
    const { rerender } = renderList({ showAllReported: true });
    expect(screen.getByTestId("list-event-event-missing").getAttribute("href")).toBe(
      "/nodes/node-1/events/event-missing/report",
    );
    expect(screen.queryByText("Office Hours")).toBeNull();
    expect(screen.queryByText("Next Meetup")).toBeNull();

    rerender(
      <ReportChecklist
        nodeId="node-1"
        now={now}
        testId="list"
        monthlyStatuses={null}
        activities={[upcoming, submitted, missing]}
        eventStatuses={[
          { activityId: submitted.id, submittedAt: "2026-11-02T00:00:00.000Z" },
          { activityId: missing.id, submittedAt: "2026-11-03T00:00:00.000Z" },
        ]}
        showAllReported
      />,
    );
    expect(screen.queryByTestId("list-event-event-missing")).toBeNull();
    expect(screen.queryByTestId("list-month-2026-12")).toBeNull();
    expect(screen.getByTestId("list-events-done")).toBeTruthy();
  });
});
