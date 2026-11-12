import { describe, expect, it } from "vitest";
import { parseEventsReportFilter, parseEventsWhen, selectAdminEvents } from "./-admin-events";

const now = Date.parse("2026-11-05T12:00:00.000Z");
const event = (id: string, startsAt: string | null, endsAt: string | null, nodeId = "lisbon") => ({
  id,
  startsAt,
  endsAt,
  nodeId,
});
const events = [
  event("later", "2026-11-20T10:00:00.000Z", "2026-11-20T13:00:00.000Z"),
  event("soon", "2026-11-06T10:00:00.000Z", "2026-11-06T13:00:00.000Z", "nairobi"),
  event("running", "2026-11-05T11:00:00.000Z", "2026-11-05T14:00:00.000Z"),
  event("recent", "2026-11-01T10:00:00.000Z", "2026-11-01T13:00:00.000Z"),
  event("no-end", "2026-10-20T10:00:00.000Z", null, "nairobi"),
];

describe("selectAdminEvents", () => {
  it("keeps past events newest first, using the start when there is no end", () => {
    expect(selectAdminEvents(events, { when: "past", now }).map((e) => e.id)).toEqual([
      "recent",
      "no-end",
    ]);
  });

  it("lists upcoming and running events soonest first", () => {
    expect(selectAdminEvents(events, { when: "upcoming", now }).map((e) => e.id)).toEqual([
      "running",
      "soon",
      "later",
    ]);
  });

  it("filters by community", () => {
    expect(
      selectAdminEvents(events, { when: "past", nodeId: "nairobi", now }).map((e) => e.id),
    ).toEqual(["no-end"]);
  });

  it("filters by the month the event started, for the Reports page's links", () => {
    expect(
      selectAdminEvents(events, { when: "past", month: "2026-10", now }).map((e) => e.id),
    ).toEqual(["no-end"]);
  });

  it("parses only known tabs", () => {
    expect(parseEventsWhen("upcoming")).toBe("upcoming");
    expect(parseEventsWhen("soon")).toBeUndefined();
    expect(parseEventsReportFilter("review")).toBe("review");
    expect(parseEventsReportFilter("late")).toBeUndefined();
  });
});
