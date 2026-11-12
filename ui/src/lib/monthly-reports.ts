const DAY_MS = 86_400_000;
const DUE_WINDOW_DAYS = 7;

export const FIRST_REPORT_MONTH = "2026-11";
export const MONTHLY_REPORT_NOTES_MAX = 20_000;
export const MONTHLY_REPORT_GUIDE = "report-each-month";

export function reportMonth(now: number, offset = 0): string {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1))
    .toISOString()
    .slice(0, 7);
}

export function isReportMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isReportableMonth(month: string): boolean {
  return month >= FIRST_REPORT_MONTH;
}

export function formatReportMonth(month: string, locale: string): string {
  return new Date(`${month}-01T00:00:00.000Z`).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function inLastWeekOfMonth(now: number): boolean {
  return Date.parse(`${reportMonth(now, 1)}-01T00:00:00.000Z`) - now <= DUE_WINDOW_DAYS * DAY_MS;
}

export function reportMonthsShown(now: number): string[] {
  return [reportMonth(now), reportMonth(now, -1)].filter(isReportableMonth);
}

export function reportableMonthsUntil(now: number): string[] {
  const months: string[] = [];
  for (let offset = 0; isReportableMonth(reportMonth(now, offset)); offset -= 1) {
    months.push(reportMonth(now, offset));
  }
  return months;
}

export function monthlyReportsOwed(submittedMonths: readonly string[], now: number): string[] {
  const submitted = new Set(submittedMonths);
  const owed: string[] = [];
  const previous = reportMonth(now, -1);
  const current = reportMonth(now);
  if (!submitted.has(previous)) owed.push(previous);
  if (inLastWeekOfMonth(now) && !submitted.has(current)) owed.push(current);
  return owed.filter(isReportableMonth);
}

export function chooseReportCommunity<T extends { slug: string }>(
  communities: readonly T[],
  requested: string | undefined,
): T | null {
  const match = requested ? communities.find((item) => item.slug === requested) : undefined;
  if (match) return match;
  const [only] = communities;
  return communities.length === 1 && only ? only : null;
}
