import { describe, expect, it } from "vitest";
import {
  activityIdFromLink,
  importReportValues,
  matchImportEvent,
  parseCsv,
  planGoogleFormImport,
  reportFromImportRow,
  resolveSubmittedBy,
  submittedAtFromRow,
} from "../../src/lib/import-google-form-reports";

function reportRow(overrides: Record<string, string> = {}) {
  return {
    "IRL or online": "In person",
    "Links to social posts": "https://x.com/harbor/status/1",
    "Was the event AI or crypto focused?": "Crypto",
    "Who was the target audience?": "Developers",
    "Describe the core theme, activation and flow of the event": "Launch night for builders",
    "How many attendees?": "42",
    "KPI 1": "40 builders",
    "KPI 2": "12 wallets",
    "KPI 3": "",
    "What went well?": "Great energy",
    "What could have been done better? Ideas for next time": "Start on time",
    "How can we better support local talent after the event?": "Office hours",
    "How can we better support talent during the event?": "Mentors",
    "Did local partners support this event?": "No",
    "What are your next action items?": "Plan the next meetup",
    ...overrides,
  };
}

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  nodeId: "22222222-2222-4222-8222-222222222222",
  nodeName: "Harbor Demo",
  title: "Harbor Launch Night",
  url: "https://luma.com/harbor-launch",
  startsAt: "2026-09-01T18:00:00.000Z",
  endsAt: "2026-09-01T21:00:00.000Z",
  timezone: "UTC",
};

const reportCells = {
  "IRL or online": "In person",
  "Links to social posts": "https://x.com/harbor/status/1",
  "Was the event AI or crypto focused?": "Crypto",
  "Who was the target audience?": "Developers",
  "Describe the core theme, activation and flow of the event": "Launch night for builders",
  "How many attendees?": "42",
  "KPI 1": "40 builders",
  "KPI 2": "12 wallets",
  "KPI 3": "",
  "What went well?": "Great energy",
  "What could have been done better? Ideas for next time": "Start on time",
  "How can we better support local talent after the event?": "Office hours",
  "How can we better support talent during the event?": "Mentors",
  "Did local partners support this event?": "No",
  "What are your next action items?": "Plan the next meetup",
};

describe("parseCsv", () => {
  it("keeps quoted commas and row numbers from the header row", () => {
    const rows = parseCsv(
      [
        'Timestamp,"Event name",Notes',
        '9/1/2026 10:00:00,"Harbor Launch Night","hello, world"',
      ].join("\n"),
    );
    expect(rows).toEqual([
      {
        rowNumber: 2,
        values: {
          Timestamp: "9/1/2026 10:00:00",
          "Event name": "Harbor Launch Night",
          Notes: "hello, world",
        },
      },
    ]);
  });
});

describe("matchImportEvent", () => {
  it("matches by activity link, event URL, or community name and date", () => {
    expect(
      matchImportEvent({ "Event link": `https://citynode.app/activity/${event.id}` }, [event]),
    ).toEqual({ event });
    expect(activityIdFromLink(event.id)).toBe(event.id);
    expect(matchImportEvent({ "Event URL": event.url }, [event])).toEqual({ event });
    expect(
      matchImportEvent(
        {
          Community: "Harbor Demo",
          "Event name": "Harbor Launch Night",
          "Event date": "09/01/2026",
        },
        [event],
      ),
    ).toEqual({ event });
  });

  it("matches community dates in the event timezone, not UTC", () => {
    expect(
      matchImportEvent(
        {
          Community: "Harbor Demo",
          "Event name": "Harbor Launch Night",
          "Event date": "09/01/2026",
        },
        [
          {
            ...event,
            startsAt: "2026-09-02T00:00:00.000Z",
            endsAt: "2026-09-02T03:00:00.000Z",
            timezone: "America/New_York",
          },
        ],
      ),
    ).toEqual({
      event: expect.objectContaining({ timezone: "America/New_York" }),
    });
  });

  it("falls back to community, name and date when the event link does not resolve", () => {
    expect(
      matchImportEvent(
        {
          "Event link": "https://luma.com/stale-or-typo",
          Community: "Harbor Demo",
          "Event name": "Harbor Launch Night",
          "Event date": "09/01/2026",
        },
        [event],
      ),
    ).toEqual({ event });
  });

  it("lists unclear rows instead of guessing", () => {
    expect(matchImportEvent({ Community: "Harbor Demo" }, [event])).toEqual({
      reason: "missing event link, or community + event name + date",
    });
    expect(
      matchImportEvent(
        {
          Community: "Harbor Demo",
          "Event name": "Harbor Launch Night",
          "Event date": "09/01/2026",
        },
        [event, { ...event, id: "33333333-3333-4333-8333-333333333333" }],
      ),
    ).toEqual({
      reason: "community, event name and date matched more than one activity",
    });
  });
});

describe("planGoogleFormImport", () => {
  it("imports matched rows, lists unmatched ones, and skips duplicates on a second pass", () => {
    const headers = [
      "Timestamp",
      "Email Address",
      "Event link",
      "Community",
      "Event name",
      "Event date",
      ...Object.keys(reportCells),
    ];
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = [
      headers.map(quote).join(","),
      [
        "9/2/2026 12:00:00",
        "owner@example.com",
        `https://citynode.app/activity/${event.id}`,
        "Harbor Demo",
        "Harbor Launch Night",
        "09/01/2026",
        ...Object.values(reportCells),
      ]
        .map(quote)
        .join(","),
      [
        "9/3/2026 12:00:00",
        "lost@example.com",
        "",
        "Unknown City",
        "Missing Meetup",
        "09/01/2026",
        ...Object.values(reportCells),
      ]
        .map(quote)
        .join(","),
    ].join("\n");

    const rows = parseCsv(csv);
    const accounts = new Map([["owner@example.com", "user-owner"]]);
    const first = planGoogleFormImport({
      rows,
      events: [event],
      existingActivityIds: new Set(),
      accounts,
      adminUserId: "platform-admin",
      now: new Date("2026-10-01T00:00:00.000Z"),
    });

    expect(first.unmatched).toEqual([
      expect.objectContaining({
        rowNumber: 3,
        reason: "community, event name and date did not match any activity",
      }),
    ]);
    expect(first.matched).toHaveLength(1);
    expect(first.matched[0]).toMatchObject({
      activityId: event.id,
      nodeId: event.nodeId,
      submittedBy: "user-owner",
      report: { attendees: 42, format: "irl", focus: "crypto" },
    });
    expect(importReportValues(first.matched[0]!)).toMatchObject({
      source: "import",
      formVersion: 1,
      submittedBy: "user-owner",
    });
    expect(reportFromImportRow(rows[0]!.values)).toMatchObject({
      report: { theme: "Launch night for builders" },
    });

    const second = planGoogleFormImport({
      rows,
      events: [event],
      existingActivityIds: new Set([event.id]),
      accounts,
      adminUserId: "platform-admin",
    });
    expect(second.matched).toEqual([]);
    expect(second.skippedExisting).toBe(1);
    expect(second.unmatched).toHaveLength(1);

    const duplicateInSameCsv = planGoogleFormImport({
      rows: [rows[0]!, rows[0]!],
      events: [event],
      existingActivityIds: new Set(),
      accounts,
      adminUserId: "platform-admin",
    });
    expect(duplicateInSameCsv.matched).toEqual([]);
    expect(duplicateInSameCsv.skippedExisting).toBe(0);
  });

  it("lists every response for an event that was answered twice instead of keeping the first", () => {
    const linkRow = (rowNumber: number, attendees: string) => ({
      rowNumber,
      values: reportRow({
        "Event link": `https://citynode.app/activity/${event.id}`,
        "How many attendees?": attendees,
      }),
    });

    const plan = planGoogleFormImport({
      rows: [linkRow(2, "40"), linkRow(5, "42")],
      events: [event],
      existingActivityIds: new Set(),
      accounts: new Map(),
      adminUserId: "platform-admin",
    });

    expect(plan.matched).toEqual([]);
    expect(plan.skippedExisting).toBe(0);
    expect(plan.unmatched.map(({ rowNumber, reason }) => ({ rowNumber, reason }))).toEqual([
      { rowNumber: 2, reason: "rows 2, 5 matched the same activity; keep one and run again" },
      { rowNumber: 5, reason: "rows 2, 5 matched the same activity; keep one and run again" },
    ]);
  });
});

describe("events that cannot take a report", () => {
  const linkRow = {
    rowNumber: 2,
    values: reportRow({ "Event link": `https://citynode.app/activity/${event.id}` }),
  };

  it("lists rows for cancelled or not-yet-ended events instead of importing them", () => {
    for (const candidate of [
      { ...event, status: "cancelled" },
      { ...event, startsAt: "2026-12-01T18:00:00.000Z", endsAt: "2026-12-01T21:00:00.000Z" },
    ]) {
      const plan = planGoogleFormImport({
        rows: [linkRow],
        events: [candidate],
        existingActivityIds: new Set(),
        accounts: new Map(),
        adminUserId: "platform-admin",
        now: new Date("2026-11-01T00:00:00.000Z"),
      });
      expect(plan.matched).toEqual([]);
      expect(plan.unmatched).toEqual([
        expect.objectContaining({ reason: "event is cancelled or has not ended yet" }),
      ]);
    }
  });
});

describe("resolveSubmittedBy", () => {
  it("uses the NEAR account column even when the form also collected emails", () => {
    expect(
      resolveSubmittedBy(
        {
          Timestamp: "9/2/2026 12:00:00",
          "Email Address": "owner@example.com",
          "Your NEAR account": "harbor-owner.testnet",
        },
        new Map([["harbor-owner.testnet", "user-owner"]]),
        "platform-admin",
      ),
    ).toBe("user-owner");
  });
});

describe("submittedAtFromRow", () => {
  const fallback = new Date("2026-10-01T00:00:00.000Z");

  it("parses Sheets timestamps as UTC rather than the machine timezone", () => {
    expect(submittedAtFromRow({ Timestamp: "9/2/2026 12:00:00" }, fallback)).toEqual(
      new Date("2026-09-02T12:00:00.000Z"),
    );
  });

  it("reads month/day timestamps that a day-first locale would swap", () => {
    expect(submittedAtFromRow({ Timestamp: "10/13/2026 14:00:00" }, fallback)).toEqual(
      new Date("2026-10-13T14:00:00.000Z"),
    );
  });

  it("rejects a day-first timestamp that invents a month instead of importing it as now", () => {
    expect(submittedAtFromRow({ Timestamp: "13/10/2026 14:00:00" }, fallback)).toBeNull();
  });

  it("rejects a calendar day that does not exist", () => {
    expect(submittedAtFromRow({ Timestamp: "2/30/2026 14:00:00" }, fallback)).toBeNull();
  });

  it("reads day/month timestamps when the sheet is day-first", () => {
    expect(submittedAtFromRow({ Timestamp: "13/10/2026 14:00:00" }, fallback, "dmy")).toEqual(
      new Date("2026-10-13T14:00:00.000Z"),
    );
    expect(submittedAtFromRow({ Timestamp: "02/09/2026 12:00:00" }, fallback, "dmy")).toEqual(
      new Date("2026-09-02T12:00:00.000Z"),
    );
  });

  it("rejects three-digit years", () => {
    expect(submittedAtFromRow({ Timestamp: "10/13/202 14:00:00" }, fallback)).toBeNull();
  });

  it("reads ISO timestamps without a zone as UTC", () => {
    expect(submittedAtFromRow({ Timestamp: "2026-10-13 14:00:00" }, fallback)).toEqual(
      new Date("2026-10-13T14:00:00.000Z"),
    );
  });

  it("uses the fallback only when the timestamp is blank", () => {
    expect(submittedAtFromRow({ Timestamp: "" }, fallback)).toEqual(fallback);
  });
});

describe("day-first sheets", () => {
  const dayFirstRow = (timestamp: string, eventDate: string) => ({
    rowNumber: 2,
    values: reportRow({
      Timestamp: timestamp,
      Community: "Harbor Demo",
      "Event name": "Harbor Launch Night",
      "Event date": eventDate,
    }),
  });

  it("matches the event date and keeps the timestamp when --day-first is used", () => {
    const plan = planGoogleFormImport({
      rows: [dayFirstRow("13/09/2026 09:30:00", "01/09/2026")],
      events: [event],
      existingActivityIds: new Set(),
      accounts: new Map(),
      adminUserId: "platform-admin",
      dateOrder: "dmy",
    });

    expect(plan.unmatched).toEqual([]);
    expect(plan.matched[0]).toMatchObject({
      activityId: event.id,
      submittedAt: new Date("2026-09-13T09:30:00.000Z"),
    });
  });

  it("lists a day-first row read as month/day instead of stamping it with the import time", () => {
    const plan = planGoogleFormImport({
      rows: [dayFirstRow("13/09/2026 09:30:00", "9/1/2026")],
      events: [event],
      existingActivityIds: new Set(),
      accounts: new Map(),
      adminUserId: "platform-admin",
    });

    expect(plan.matched).toEqual([]);
    expect(plan.unmatched).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        reason: "timestamp was not a month/day/year date (use --day-first for day/month sheets)",
      }),
    ]);
  });

  it("reads day-first event dates that carry a time or use dots", () => {
    const row = (eventDate: string) => ({
      Community: "Harbor Demo",
      "Event name": "Harbor Launch Night",
      "Event date": eventDate,
    });
    expect(matchImportEvent(row("01/09/2026 18:00"), [event], "dmy")).toEqual({ event });
    expect(matchImportEvent(row("01.09.2026"), [event], "dmy")).toEqual({ event });
    expect(matchImportEvent(row("09/01/2026 18:00"), [event], "dmy")).toEqual({
      reason: "community, event name and date did not match any activity",
    });
  });

  it("does not match an event date that only exists as day/month", () => {
    expect(
      matchImportEvent(
        {
          Community: "Harbor Demo",
          "Event name": "Harbor Launch Night",
          "Event date": "13/09/2026",
        },
        [event],
      ),
    ).toEqual({ reason: "event date could not be parsed" });
  });
});

describe("reportFromImportRow", () => {
  it("lists blank KPIs instead of storing an em dash", () => {
    expect(reportFromImportRow(reportRow({ "KPI 1": "", "KPI 2": "12 wallets" }))).toEqual({
      reason: "KPI 1 or 2 was missing",
    });
  });

  it("lists blank attendee counts instead of importing 0", () => {
    expect(reportFromImportRow(reportRow({ "How many attendees?": "" }))).toEqual({
      reason: "attendee count was missing or invalid",
    });
  });

  it("does not treat blockchain answers as AI focus", () => {
    expect(
      reportFromImportRow(reportRow({ "Was the event AI or crypto focused?": "Blockchain" })),
    ).toMatchObject({ report: { focus: "crypto" } });
    expect(
      reportFromImportRow(reportRow({ "Was the event AI or crypto focused?": "AI and crypto" })),
    ).toEqual({ reason: "focus was missing or unrecognized" });
  });

  it("keeps unrecognized audiences as other instead of dropping them", () => {
    expect(
      reportFromImportRow(reportRow({ "Who was the target audience?": "Developers, Founders" })),
    ).toMatchObject({
      report: { audiences: ["developers", "other"], audienceOther: "Founders" },
    });
  });
});
