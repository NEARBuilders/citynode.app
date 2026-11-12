import { describe, expect, it } from "vitest";
import {
  chooseReportCommunity,
  monthlyReportsOwed,
  reportableMonthsUntil,
  reportMonthsShown,
} from "./monthly-reports";

const at = (iso: string) => Date.parse(iso);

describe("monthly reports owed", () => {
  it("owes last month's report until it is submitted, through the edit window", () => {
    expect(monthlyReportsOwed([], at("2026-12-12T12:00:00.000Z"))).toEqual(["2026-11"]);
    expect(monthlyReportsOwed(["2026-11"], at("2026-12-12T12:00:00.000Z"))).toEqual([]);
    expect(monthlyReportsOwed(["2026-11"], at("2027-01-05T12:00:00.000Z"))).toEqual(["2026-12"]);
  });

  it("owes this month's report in its last seven days", () => {
    expect(monthlyReportsOwed(["2026-11"], at("2026-12-23T23:59:00.000Z"))).toEqual([]);
    expect(monthlyReportsOwed(["2026-11"], at("2026-12-25T00:00:00.000Z"))).toEqual(["2026-12"]);
    expect(monthlyReportsOwed(["2026-11", "2026-12"], at("2026-12-28T00:00:00.000Z"))).toEqual([]);
  });

  it("never owes a month before November 2026, the first reported month", () => {
    expect(monthlyReportsOwed([], at("2026-11-12T12:00:00.000Z"))).toEqual([]);
    expect(monthlyReportsOwed([], at("2026-11-24T00:00:00.000Z"))).toEqual(["2026-11"]);
    expect(reportMonthsShown(at("2026-11-12T12:00:00.000Z"))).toEqual(["2026-11"]);
    expect(reportMonthsShown(at("2026-12-12T12:00:00.000Z"))).toEqual(["2026-12", "2026-11"]);
    expect(reportMonthsShown(at("2026-12-12T12:00:00.000Z"), "2026-12")).toEqual(["2026-12"]);
    expect(monthlyReportsOwed([], at("2027-01-12T12:00:00.000Z"), "2027-01")).toEqual([]);
    expect(monthlyReportsOwed([], at("2027-01-12T12:00:00.000Z"), "2026-12")).toEqual([
      "2026-12",
    ]);
    expect(reportableMonthsUntil(at("2027-01-02T00:00:00.000Z"))).toEqual([
      "2027-01",
      "2026-12",
      "2026-11",
    ]);
  });
});

describe("choosing the community to report for", () => {
  const harbor = { slug: "harbor" };
  const alder = { slug: "alder" };

  it("opens the only community, or the one the link names", () => {
    expect(chooseReportCommunity([harbor], undefined)).toBe(harbor);
    expect(chooseReportCommunity([harbor], "gone")).toBe(harbor);
    expect(chooseReportCommunity([harbor, alder], "alder")).toBe(alder);
  });

  it("asks when there are several and the link names none of them", () => {
    expect(chooseReportCommunity([harbor, alder], undefined)).toBeNull();
    expect(chooseReportCommunity([harbor, alder], "gone")).toBeNull();
    expect(chooseReportCommunity([], undefined)).toBeNull();
  });
});
