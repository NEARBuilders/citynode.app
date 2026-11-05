import { Badge } from "@/components/ui/badge";
import { useAppTranslation } from "@/i18n/runtime";
import { eventReportStatus } from "@/lib/event-reports";

export function ReportStatusBadge({
  activity,
  submittedAt,
  now,
}: {
  activity: { id: string; startsAt: string | null; endsAt: string | null };
  submittedAt: string | null | undefined;
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
  return (
    <Badge variant="secondary" data-testid={`report-status-${activity.id}`}>
      {translate(status.late ? "report.status.late" : "report.status.submitted")}
    </Badge>
  );
}
