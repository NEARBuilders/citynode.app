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
