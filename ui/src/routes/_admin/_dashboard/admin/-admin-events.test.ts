import { describe, expect, it } from "vitest";
import {
  eventCommunities,
  parseEventsReportFilter,
  parseEventsWhen,
  resolveEventsCommunity,
  selectAdminEvents,
} from "./-admin-events";

const now = Date.parse("2026-11-05T12:00:00.000Z");
const ORGS: Record<string, string> = {
  lisbon: "org-lisbon",
  nairobi: "org-nairobi",
  "nairobi-east": "org-nairobi",
};
const NAMES: Record<string, string> = {
  lisbon: "Lisbon",
  nairobi: "Nairobi",
  "nairobi-east": "Nairobi East",
};
const event = (id: string, startsAt: string | null, endsAt: string | null, nodeId = "lisbon") => ({
  id,
  startsAt,
  endsAt,
  nodeId,
  nodeName: NAMES[nodeId] ?? nodeId,
  organizationId: ORGS[nodeId] ?? null,
});
const events = [
  event("later", "2026-11-20T10:00:00.000Z", "2026-11-20T13:00:00.000Z"),
  event("soon", "2026-11-06T10:00:00.000Z", "2026-11-06T13:00:00.000Z", "nairobi"),
  event("running", "2026-11-05T11:00:00.000Z", "2026-11-05T14:00:00.000Z"),
  event("recent", "2026-11-01T10:00:00.000Z", "2026-11-01T13:00:00.000Z"),
  event("east", "2026-10-28T10:00:00.000Z", "2026-10-28T13:00:00.000Z", "nairobi-east"),
  event("no-end", "2026-10-20T10:00:00.000Z", null, "nairobi"),
  event("loose", "2026-10-10T10:00:00.000Z", null, "loose-node"),
];

describe("selectAdminEvents", () => {
  it("keeps past events newest first, using the start when there is no end", () => {
    expect(selectAdminEvents(events, { when: "past", now }).map((e) => e.id)).toEqual([
      "recent",
      "east",
      "no-end",
      "loose",
    ]);
  });

  it("lists upcoming and running events soonest first", () => {
    expect(selectAdminEvents(events, { when: "upcoming", now }).map((e) => e.id)).toEqual([
      "running",
      "soon",
      "later",
    ]);
  });

  it("filters by community, across all of its nodes", () => {
    expect(
      selectAdminEvents(events, { when: "past", community: "org-nairobi", now }).map((e) => e.id),
    ).toEqual(["east", "no-end"]);
  });

  it("still opens a community from an older link that names one of its nodes", () => {
    expect(resolveEventsCommunity(events, "nairobi-east")).toBe("org-nairobi");
    expect(
      selectAdminEvents(events, { when: "past", community: "nairobi-east", now }).map((e) => e.id),
    ).toEqual(["east", "no-end"]);
    expect(
      selectAdminEvents(events, { when: "past", community: "loose-node", now }).map((e) => e.id),
    ).toEqual(["loose"]);
  });

  it("offers each community once, named after its nodes", () => {
    expect(eventCommunities(events)).toEqual([
      ["org-lisbon", "Lisbon"],
      ["loose-node", "loose-node"],
      ["org-nairobi", "Nairobi, Nairobi East"],
    ]);
  });

  it("filters by the month the event started, for the Reports page's links", () => {
    expect(
      selectAdminEvents(events, { when: "past", month: "2026-10", now }).map((e) => e.id),
    ).toEqual(["east", "no-end", "loose"]);
  });

  it("parses only known tabs", () => {
    expect(parseEventsWhen("upcoming")).toBe("upcoming");
    expect(parseEventsWhen("soon")).toBeUndefined();
    expect(parseEventsReportFilter("review")).toBe("review");
    expect(parseEventsReportFilter("late")).toBeUndefined();
  });
});
