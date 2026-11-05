import { describe, expect, it } from "vitest";
import {
  draftFromReport,
  emptyReportDraft,
  eventReportStatus,
  type ReportDraft,
  reportedWithinWeek,
  reportFromDraft,
} from "./event-reports";

const DAY = 24 * 3_600_000;
const now = Date.parse("2026-11-05T12:00:00.000Z");
const event = (endOffsetDays: number) => ({
  startsAt: new Date(now + (endOffsetDays - 0.1) * DAY).toISOString(),
  endsAt: new Date(now + endOffsetDays * DAY).toISOString(),
});

describe("eventReportStatus", () => {
  it("is not due before the event ends", () => {
    expect(eventReportStatus(event(1), null, now)).toEqual({ state: "notDue" });
  });

  it("is missing once the event has ended without a report", () => {
    expect(eventReportStatus(event(-1), null, now)).toEqual({ state: "missing" });
  });

  it("is submitted, and late only when more than a week after the end", () => {
    const ended = event(-10);
    const end = Date.parse(ended.endsAt);
    expect(eventReportStatus(ended, new Date(end + 6 * DAY).toISOString(), now)).toEqual({
      state: "submitted",
      late: false,
    });
    expect(eventReportStatus(ended, new Date(end + 8 * DAY).toISOString(), now)).toEqual({
      state: "submitted",
      late: true,
    });
  });

  it("uses the start when an event has no end", () => {
    const past = { startsAt: new Date(now - DAY).toISOString(), endsAt: null };
    expect(eventReportStatus(past, null, now)).toEqual({ state: "missing" });
  });
});

function filled(overrides: Partial<ReportDraft> = {}): ReportDraft {
  return {
    ...emptyReportDraft(12),
    format: "irl",
    focus: "crypto",
    audiences: ["developers"],
    theme: "Build night",
    kpis: ["40 people", "12 members", ""],
    hadPartners: false,
    wentWell: "Energy",
    improvements: "Timing",
    talentAfter: "Office hours",
    talentDuring: "Mentors",
    nextActions: "Next meetup",
    socialLinks: "https://example.com/a\nhttps://example.com/b",
    ...overrides,
  };
}

describe("reportFromDraft", () => {
  it("builds a report from a complete draft", () => {
    const result = reportFromDraft(filled());
    expect(result.errors).toBeNull();
    expect(result.report).toMatchObject({
      attendees: 12,
      socialLinks: ["https://example.com/a", "https://example.com/b"],
      partners: "",
    });
  });

  it("flags required answers, the other audience, partners and bad links", () => {
    const result = reportFromDraft(
      filled({
        theme: " ",
        audiences: ["other"],
        hadPartners: true,
        socialLinks: "not-a-link",
        attendees: "-3",
      }),
    );
    expect(result.errors).toEqual({
      theme: "required",
      audienceOther: "required",
      partners: "required",
      socialLinks: "invalidLink",
      attendees: "invalidNumber",
    });
  });

  it("round-trips a saved report back into the form", () => {
    const report = reportFromDraft(filled()).report;
    if (!report) throw new Error("expected a report");
    expect(reportFromDraft(draftFromReport(report)).report).toEqual(report);
  });
});

describe("reportedWithinWeek", () => {
  it("counts ended events reported within a week out of all ended events", () => {
    const ended = event(-20);
    const end = Date.parse(ended.endsAt);
    expect(
      reportedWithinWeek(
        [
          { ...ended, reportSubmittedAt: new Date(end + DAY).toISOString() },
          { ...ended, reportSubmittedAt: new Date(end + 9 * DAY).toISOString() },
          { ...ended, reportSubmittedAt: null },
          { ...event(2), reportSubmittedAt: null },
        ],
        now,
      ),
    ).toEqual({ onTime: 1, due: 3 });
  });
});
