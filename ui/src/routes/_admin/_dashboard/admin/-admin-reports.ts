import type { ApiClient } from "@/app";
import { isReportableMonth, isReportMonth, reportMonth } from "@/lib/monthly-reports";

export type AdminMonthlyRow = Awaited<
  ReturnType<ApiClient["getAdminMonthlyReports"]>
>["communities"][number];

export type ReportsFilter = "missing" | "review";

export const REPORTS_FILTERS: readonly ReportsFilter[] = ["missing", "review"];

export function parseReportsFilter(value: unknown): ReportsFilter | undefined {
  return REPORTS_FILTERS.find((filter) => filter === value);
}

export function parseReportsMonth(value: unknown, now: number): string | undefined {
  return typeof value === "string" &&
    isReportMonth(value) &&
    isReportableMonth(value) &&
    value <= reportMonth(now)
    ? value
    : undefined;
}

export function filterReportRows(
  rows: readonly AdminMonthlyRow[],
  filter: ReportsFilter | undefined,
): AdminMonthlyRow[] {
  if (filter === "missing") return rows.filter((row) => row.status === "missing");
  if (filter === "review") {
    return rows.filter((row) => row.status === "submitted" || row.events.toReview > 0);
  }
  return [...rows];
}

export function summarizeReports(rows: readonly AdminMonthlyRow[]) {
  return {
    expected: rows.length,
    submitted: rows.filter((row) => row.status !== "missing").length,
    toReview: rows.filter((row) => row.status === "submitted").length,
    missing: rows.filter((row) => row.status === "missing").length,
    eventsToReview: rows.reduce((sum, row) => sum + row.events.toReview, 0),
    eventsMissing: rows.reduce((sum, row) => sum + row.events.ended - row.events.reported, 0),
  };
}
