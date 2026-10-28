import { describe, expect, it } from "vitest";
import {
  type CodeCheckIns,
  type EventCodeListing,
  ONBOARDING_CODE_LIST_LIMIT,
  summarizeReturningMembers,
} from "./returning-members";

const readAt = "2026-10-28T10:00:00.000Z";

function listing(eventId: string, count = 1, codeEventId: string | null = eventId) {
  return {
    eventId,
    codes: Array.from({ length: count }, (_, index) => ({
      id: `${eventId}-code-${index}`,
      eventId: codeEventId,
    })),
  } satisfies EventCodeListing;
}

function checkIn(eventId: string | null, ...userIds: string[]): CodeCheckIns {
  return { eventId, joined: userIds.map((userId) => ({ userId })) };
}

function summarize(eventIds: string[], listings: EventCodeListing[], checkIns: CodeCheckIns[]) {
  return summarizeReturningMembers({ eventIds: new Set(eventIds), listings, checkIns, readAt });
}

describe("summarizeReturningMembers", () => {
  it("omits the stat when the community has no codes", () => {
    expect(summarize(["event-a"], [listing("event-a", 0)], [])).toEqual({ kind: "no-codes" });
  });

  it("reports no eligible check-ins instead of a zero share", () => {
    expect(summarize(["event-a"], [listing("event-a")], [checkIn("event-a")])).toEqual({
      kind: "no-check-ins",
      mayBeIncomplete: false,
      readAt,
    });
  });

  it("counts people at two or more distinct events as returning", () => {
    expect(
      summarize(
        ["event-a", "event-b"],
        [listing("event-a"), listing("event-b")],
        [checkIn("event-a", "user-1", "user-2", "user-3"), checkIn("event-b", "user-1")],
      ),
    ).toEqual({ kind: "ready", returning: 1, total: 3, mayBeIncomplete: false, readAt });
  });

  it("counts several codes for one event once", () => {
    expect(
      summarize(
        ["event-a"],
        [listing("event-a", 3)],
        [
          checkIn("event-a", "user-1"),
          checkIn("event-a", "user-1"),
          checkIn("event-a", "user-1", "user-2"),
        ],
      ),
    ).toMatchObject({ kind: "ready", returning: 0, total: 2 });
  });

  it("keeps same-named events with different IDs distinct", () => {
    expect(
      summarize(
        ["meetup-october", "meetup-november"],
        [listing("meetup-october"), listing("meetup-november")],
        [checkIn("meetup-october", "user-1"), checkIn("meetup-november", "user-1")],
      ),
    ).toMatchObject({ kind: "ready", returning: 1, total: 1 });
  });

  it("leaves out codes without an event ID or outside the community's events", () => {
    expect(
      summarize(
        ["event-a"],
        [listing("event-a"), listing("event-a", 1, null), listing("other-event")],
        [checkIn("event-a", "user-1"), checkIn(null, "user-1"), checkIn("other-event", "user-1")],
      ),
    ).toMatchObject({ kind: "ready", returning: 0, total: 1 });
    expect(summarize(["event-a"], [listing("event-a", 1, null)], [])).toEqual({
      kind: "no-codes",
    });
  });

  it("still counts people who later left or were removed", () => {
    expect(
      summarize(
        ["event-a", "event-b"],
        [listing("event-a"), listing("event-b")],
        [checkIn("event-a", "departed-user"), checkIn("event-b", "departed-user", "removed-user")],
      ),
    ).toMatchObject({ kind: "ready", returning: 1, total: 2 });
  });

  it("marks the stat incomplete when an event returns exactly the listing limit", () => {
    expect(
      summarize(
        ["event-a"],
        [listing("event-a", ONBOARDING_CODE_LIST_LIMIT)],
        [checkIn("event-a", "user-1")],
      ),
    ).toMatchObject({ kind: "ready", mayBeIncomplete: true });
    expect(
      summarize(
        ["event-a"],
        [listing("event-a", ONBOARDING_CODE_LIST_LIMIT - 1)],
        [checkIn("event-a", "user-1")],
      ),
    ).toMatchObject({ kind: "ready", mayBeIncomplete: false });
  });

  it("marks the stat incomplete when an event returns more than the listing limit", () => {
    expect(
      summarize(["event-a"], [listing("event-a", ONBOARDING_CODE_LIST_LIMIT + 1)], []),
    ).toMatchObject({ kind: "no-check-ins", mayBeIncomplete: true });
  });
});
