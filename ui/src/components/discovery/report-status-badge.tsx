import type { ApiClient } from "@/app";
import { Badge } from "@/components/ui/badge";
import { useAppTranslation } from "@/i18n/runtime";
import { eventReportStatus } from "@/lib/event-reports";

type ReportSource = NonNullable<
  Awaited<ReturnType<ApiClient["listEventReportStatuses"]>>[number]["source"]
>;

export function ReportStatusBadge({
  activity,
  submittedAt,
  source,
  now,
}: {
  activity: { id: string; startsAt: string | null; endsAt: string | null };
  submittedAt: string | null | undefined;
  source?: ReportSource | null;
  now: number;
}) {
  const translate = useAppTranslation();
  const status = eventReportStatus(activity, submittedAt, now);
  if (status.state === "notDue") return null;
  if (status.state === "missing") {
    return (
      <Badge variant="warning" data-testid={`report-status-${activity.id}`}>
        {translate("report.status.missing")}
      </Badge>
    );
  }
  if (source === "import") {
    return (
      <Badge variant="secondary" data-testid={`report-status-${activity.id}`}>
        {translate("report.status.imported")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid={`report-status-${activity.id}`}>
      {translate("report.status.submitted")}
    </Badge>
  );
}
