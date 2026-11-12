import { describe, expect, it } from "vitest";
import { reportMonthWindow } from "@/report-month";

describe("report month window", () => {
  it("closes at the end of the following month, across the year end", () => {
    expect(reportMonthWindow("2026-12")).toEqual({
      from: new Date("2026-12-01T00:00:00.000Z"),
      to: new Date("2027-01-01T00:00:00.000Z"),
      closesAt: new Date("2027-02-01T00:00:00.000Z"),
    });
  });
});
