// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@/i18n/test-render";
import { EventsToReport } from "./events-to-report";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
    "data-testid": testId,
  }: {
    children?: ReactNode;
    to?: string;
    params?: { nodeId?: string; activityId?: string };
    "data-testid"?: string;
  }) => (
    <a
      href={`${to}?nodeId=${params?.nodeId ?? ""}&activityId=${params?.activityId ?? ""}`}
      data-testid={testId}
    >
      {children}
    </a>
  ),
}));

const now = Date.parse("2026-11-05T12:00:00.000Z");

function activity(id: string, title: string, ended: boolean) {
  return {
    id,
    title,
    kind: "event" as const,
    status: "published" as const,
    publishedAt: "2026-01-01T00:00:00.000Z",
    startsAt: ended ? "2026-11-01T16:00:00.000Z" : "2026-12-01T16:00:00.000Z",
    endsAt: ended ? "2026-11-01T18:00:00.000Z" : "2026-12-01T18:00:00.000Z",
    venue: "Town Hall",
  };
}

const missing = activity("event-missing", "Builders Night", true);
const submitted = activity("event-done", "Office Hours", true);
const upcoming = activity("event-next", "Next Meetup", false);

afterEach(cleanup);

describe("EventsToReport", () => {
  it("hides the row from members", () => {
    render(
      <EventsToReport
        canReport={false}
        ready
        nodeId="node-1"
        now={now}
        activities={[missing]}
        statuses={[]}
      />,
    );
    expect(screen.queryByTestId("dashboard-node.events-to-report")).toBeNull();
    expect(screen.queryByText("Builders Night")).toBeNull();
  });

  it("lists ended events with a missing report until one is submitted", () => {
    const { rerender } = render(
      <EventsToReport
        canReport
        ready
        nodeId="node-1"
        now={now}
        activities={[upcoming, submitted, missing]}
        statuses={[{ activityId: submitted.id, submittedAt: "2026-11-02T00:00:00.000Z" }]}
      />,
    );
    const link = screen.getByTestId("dashboard-node.report-event-missing");
    expect(link.getAttribute("href")).toBe(
      "/nodes/$nodeId/events/$activityId/report?nodeId=node-1&activityId=event-missing",
    );
    expect(screen.queryByText("Office Hours")).toBeNull();
    expect(screen.queryByText("Next Meetup")).toBeNull();

    rerender(
      <EventsToReport
        canReport
        ready
        nodeId="node-1"
        now={now}
        activities={[upcoming, submitted, missing]}
        statuses={[
          { activityId: submitted.id, submittedAt: "2026-11-02T00:00:00.000Z" },
          { activityId: missing.id, submittedAt: "2026-11-03T00:00:00.000Z" },
        ]}
      />,
    );
    expect(screen.queryByTestId("dashboard-node.events-to-report")).toBeNull();
  });

  it("waits until report status has loaded", () => {
    render(
      <EventsToReport
        canReport
        ready={false}
        nodeId="node-1"
        now={now}
        activities={[missing]}
        statuses={[]}
      />,
    );
    expect(screen.queryByTestId("dashboard-node.events-to-report")).toBeNull();
  });
});
