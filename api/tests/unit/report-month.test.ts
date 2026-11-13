import { describe, expect, it } from "vitest";
import { firstReportMonth, reportMonthWindow } from "@/report-month";

describe("report month window", () => {
  it("closes at the end of the following month, across the year end", () => {
    expect(reportMonthWindow("2026-12")).toEqual({
      from: new Date("2026-12-01T00:00:00.000Z"),
      to: new Date("2027-01-01T00:00:00.000Z"),
      closesAt: new Date("2027-02-01T00:00:00.000Z"),
    });
  });

  it("starts a community's reports with the month it started, never before November 2026", () => {
    expect(firstReportMonth(null)).toBe("2026-11");
    expect(firstReportMonth(new Date("2026-03-04T00:00:00.000Z"))).toBe("2026-11");
    expect(firstReportMonth(new Date("2026-12-01T00:00:00.000Z"))).toBe("2026-12");
    expect(firstReportMonth(new Date("2027-01-31T23:59:59.000Z"))).toBe("2027-01");
  });
});
