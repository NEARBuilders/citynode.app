// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@/i18n/test-render";
import { ReportStatusBadge } from "./report-status-badge";

const now = Date.parse("2026-12-05T12:00:00.000Z");
const ended = {
  id: "event-1",
  startsAt: "2026-09-01T18:00:00.000Z",
  endsAt: "2026-09-01T21:00:00.000Z",
};

function badgeText() {
  return screen.getByTestId("report-status-event-1").textContent;
}

describe("ReportStatusBadge", () => {
  afterEach(cleanup);

  it("labels an imported report instead of calling it late", () => {
    render(
      <ReportStatusBadge
        activity={ended}
        submittedAt="2026-11-15T00:00:00.000Z"
        source="import"
        now={now}
      />,
    );
    expect(badgeText()).toBe("Imported report");
  });

  it("shows Reviewed once an imported report has been reviewed", () => {
    render(
      <ReportStatusBadge
        activity={ended}
        submittedAt="2026-11-15T00:00:00.000Z"
        reviewedAt="2026-11-20T00:00:00.000Z"
        source="import"
        now={now}
      />,
    );
    expect(badgeText()).toBe("Reviewed");
  });

  it("keeps Report missing when there is no report", () => {
    render(<ReportStatusBadge activity={ended} submittedAt={null} source={null} now={now} />);
    expect(badgeText()).toBe("Report missing");
  });
});
