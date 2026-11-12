import { Link } from "@tanstack/react-router";
import { LocalDate } from "@/components/local-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { eventsMissingReports } from "@/lib/event-reports";
import type { VisibilityActivity } from "@/lib/event-visibility";
import { formatReportMonth, reportMonth, reportMonthsShown } from "@/lib/monthly-reports";
import { ReviewedBadge } from "./report-review";

type ReportActivity = VisibilityActivity & { id: string; title: string; venue: string };

export function ReportChecklist({
  nodeId,
  now,
  testId,
  monthlyStatuses,
  activities,
  eventStatuses,
  showAllReported = false,
}: {
  nodeId: string;
  now: number;
  testId: string;
  monthlyStatuses:
    | readonly { month: string; submittedAt: string; reviewedAt?: string | null }[]
    | null;
  activities: readonly ReportActivity[];
  eventStatuses: readonly { activityId: string; submittedAt: string }[];
  showAllReported?: boolean;
}) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const events = eventsMissingReports(activities, eventStatuses, now);
  const submitted = new Map(monthlyStatuses?.map((status) => [status.month, status]) ?? []);
  const previous = reportMonth(now, -1);
  return (
    <div className="flex flex-col gap-6" data-testid={testId}>
      {monthlyStatuses && (
        <ItemGroup>
          {reportMonthsShown(now).map((month) => {
            const status = submitted.get(month);
            const done = !!status;
            const closesIn = reportMonth(Date.parse(`${month}-01T00:00:00.000Z`), 1);
            return (
              <Item key={month} variant="outline" data-testid={`${testId}-month-${month}`}>
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex-wrap">
                    {translate("reports.monthlyTitle", {
                      month: formatReportMonth(month, locale),
                    })}
                    {status?.reviewedAt ? (
                      <ReviewedBadge testId={`${testId}-month-${month}-reviewed`} />
                    ) : done ? (
                      <Badge variant="secondary">{translate("report.status.submitted")}</Badge>
                    ) : month === previous ? (
                      <Badge variant="warning">{translate("report.status.missing")}</Badge>
                    ) : null}
                  </ItemTitle>
                  <ItemDescription>
                    {translate("reports.monthlyOpenUntil", {
                      month: formatReportMonth(closesIn, locale),
                    })}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="sm"
                    variant={done ? "outline" : "default"}
                    nativeButton={false}
                    render={<Link to="/nodes/$nodeId/reports/$month" params={{ nodeId, month }} />}
                    data-testid={`${testId}-month-${month}-open`}
                  >
                    {translate(done ? "reports.edit" : "reports.start")}
                  </Button>
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}
      {events.length > 0 ? (
        <ItemGroup>
          {events.map((event) => (
            <Item key={event.id} variant="outline">
              <ItemContent className="min-w-0">
                <ItemTitle className="flex-wrap">
                  <Link
                    to="/nodes/$nodeId/events/$activityId/report"
                    params={{ nodeId, activityId: event.id }}
                    className="hover:underline"
                    data-testid={`${testId}-event-${event.id}`}
                  >
                    {event.title}
                  </Link>
                  <Badge variant="warning">{translate("report.status.missing")}</Badge>
                </ItemTitle>
                <ItemDescription>
                  {event.endsAt ? <LocalDate value={event.endsAt} format="datetime" /> : null}
                  {event.venue ? ` · ${event.venue}` : ""}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      to="/nodes/$nodeId/events/$activityId/report"
                      params={{ nodeId, activityId: event.id }}
                    />
                  }
                >
                  {translate("events.submitReport")}
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : showAllReported ? (
        <p className="text-sm text-muted-foreground" data-testid={`${testId}-events-done`}>
          {translate("reports.eventsAllReported")}
        </p>
      ) : null}
    </div>
  );
}

export function hasReportsToShow(
  monthlyStatuses: readonly unknown[] | null,
  activities: readonly ReportActivity[],
  eventStatuses: readonly { activityId: string; submittedAt: string }[],
  now: number,
) {
  return !!monthlyStatuses || eventsMissingReports(activities, eventStatuses, now).length > 0;
}
