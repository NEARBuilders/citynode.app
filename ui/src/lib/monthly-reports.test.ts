import { describe, expect, it } from "vitest";
import { chooseReportCommunity, monthlyReportsOwed } from "./monthly-reports";

const at = (iso: string) => Date.parse(iso);

describe("monthly reports owed", () => {
  it("owes last month's report until it is submitted, through the edit window", () => {
    expect(monthlyReportsOwed([], at("2026-11-12T12:00:00.000Z"))).toEqual(["2026-10"]);
    expect(monthlyReportsOwed(["2026-10"], at("2026-11-12T12:00:00.000Z"))).toEqual([]);
    expect(monthlyReportsOwed(["2026-10"], at("2026-12-05T12:00:00.000Z"))).toEqual(["2026-11"]);
  });

  it("owes this month's report in its last seven days", () => {
    expect(monthlyReportsOwed(["2026-10"], at("2026-11-23T23:59:00.000Z"))).toEqual([]);
    expect(monthlyReportsOwed(["2026-10"], at("2026-11-24T00:00:00.000Z"))).toEqual(["2026-11"]);
    expect(monthlyReportsOwed(["2026-10", "2026-11"], at("2026-11-28T00:00:00.000Z"))).toEqual([]);
    expect(monthlyReportsOwed(["2026-11"], at("2026-12-29T00:00:00.000Z"))).toEqual(["2026-12"]);
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
