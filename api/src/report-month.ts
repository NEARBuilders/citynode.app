export const FIRST_REPORT_MONTH = "2026-11";

export interface ReportMonthWindow {
  from: Date;
  to: Date;
  closesAt: Date;
}

export function isReportableMonth(month: string): boolean {
  return month >= FIRST_REPORT_MONTH;
}

export function reportMonthWindow(month: string): ReportMonthWindow {
  const [year = 0, index = 1] = month.split("-").map(Number);
  return {
    from: new Date(Date.UTC(year, index - 1, 1)),
    to: new Date(Date.UTC(year, index, 1)),
    closesAt: new Date(Date.UTC(year, index + 1, 1)),
  };
}

export function firstReportMonth(communityStart: Date | null): string {
  const started = communityStart?.toISOString().slice(0, 7);
  return started && started > FIRST_REPORT_MONTH ? started : FIRST_REPORT_MONTH;
}
