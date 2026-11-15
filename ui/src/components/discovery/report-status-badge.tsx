import type { ApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import { eventReportStatus } from "@/lib/event-reports";

type ReportSource = NonNullable<
  Awaited<ReturnType<ApiClient["listEventReportStatuses"]>>[number]["source"]
>;

export type ReportState = "reviewed" | "imported" | "submitted" | "late" | "missing" | "notYet";

const REPORT_STATES: Record<
  ReportState,
  { variant: "success" | "secondary" | "warning" | "outline"; label: AppMessageId }
> = {
  reviewed: { variant: "success", label: "report.status.reviewed" },
  imported: { variant: "secondary", label: "report.status.imported" },
  submitted: { variant: "secondary", label: "report.status.submitted" },
  late: { variant: "secondary", label: "report.status.late" },
  missing: { variant: "warning", label: "report.status.missing" },
  notYet: { variant: "outline", label: "admin.reports.notYet" },
};

export function ReportStateBadge({ state, testId }: { state: ReportState; testId?: string }) {
  const translate = useAppTranslation();
  const { variant, label } = REPORT_STATES[state];
  return (
    <Badge variant={variant} data-testid={testId}>
      {translate(label)}
    </Badge>
  );
}

export function ReportStatusBadge({
  activity,
  submittedAt,
  reviewedAt,
  source,
  now,
}: {
  activity: { id: string; startsAt: string | null; endsAt: string | null };
  submittedAt: string | null | undefined;
  reviewedAt?: string | null;
  source?: ReportSource | null;
  now: number;
}) {
  const status = eventReportStatus(activity, submittedAt, now);
  if (status.state === "notDue") return null;
  const state =
    status.state === "missing"
      ? "missing"
      : reviewedAt
        ? "reviewed"
        : source === "import"
          ? "imported"
          : status.late
            ? "late"
            : "submitted";
  return <ReportStateBadge state={state} testId={`report-status-${activity.id}`} />;
}
