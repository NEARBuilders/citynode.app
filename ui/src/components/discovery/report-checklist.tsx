import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { LocalDate } from "@/components/local-date";
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
import { eventVisibility, type VisibilityActivity } from "@/lib/event-visibility";
import { formatReportMonth, reportMonth, reportMonthsShown } from "@/lib/monthly-reports";
import { eventReportStatusesQueryOptions } from "@/lib/queries/event-reports";
import { monthlyReportStatusesQueryOptions } from "@/lib/queries/monthly-reports";
import { refetchAll } from "@/lib/queries/refetch-all";
import { activitiesQueryOptions } from "./activity-form";
import { ReportStateBadge } from "./report-status-badge";

type ReportActivity = VisibilityActivity & {
  id: string;
  title: string;
  venue: string;
  ownerNodeId?: string;
};

export function useReportChecklist(nodeId: string, nodeIds: readonly string[] = [nodeId]) {
  const api = useApiClient();
  const activities = useQueries({
    queries: nodeIds.map((id) => activitiesQueryOptions(api, id)),
  });
  const eventStatuses = useQueries({
    queries: nodeIds.map((id) => eventReportStatusesQueryOptions(api, id)),
  });
  const monthlyStatuses = useQuery(monthlyReportStatusesQueryOptions(api, nodeId));
  const queries = [...activities, ...eventStatuses, monthlyStatuses];
  const failed = queries.filter((query) => query.isError);
  return {
    failed: failed.length > 0,
    error: failed[0]?.error ?? null,
    pending: queries.some((query) => query.isPending),
    retry: () => refetchAll(failed),
    lists: {
      activities: activities.flatMap((query) => query.data ?? []),
      eventStatuses: eventStatuses.flatMap((query) => query.data ?? []),
      monthlyStatuses: monthlyStatuses.data?.statuses ?? [],
      firstMonth: monthlyStatuses.data?.firstMonth,
    },
  };
}

export function ReportChecklist({
  nodeId,
  now,
  testId,
  monthlyStatuses,
  activities,
  eventStatuses,
  firstMonth,
  showAllReported = false,
}: {
  nodeId: string;
  now: number;
  testId: string;
  firstMonth?: string;
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
  const anyEnded = activities.some(
    (activity) => eventVisibility(activity, { communityPublic: true, now }) === "ended",
  );
  const submitted = new Map(monthlyStatuses?.map((status) => [status.month, status]) ?? []);
  const previous = reportMonth(now, -1);
  return (
    <div className="flex flex-col gap-6" data-testid={testId}>
      {monthlyStatuses && (
        <ItemGroup>
          {reportMonthsShown(now, firstMonth).map((month) => {
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
                      <ReportStateBadge
                        state="reviewed"
                        testId={`${testId}-month-${month}-reviewed`}
                      />
                    ) : done ? (
                      <ReportStateBadge state="submitted" />
                    ) : month === previous ? (
                      <ReportStateBadge state="missing" />
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
                    params={{ nodeId: event.ownerNodeId ?? nodeId, activityId: event.id }}
                    className="hover:underline"
                    data-testid={`${testId}-event-${event.id}`}
                  >
                    {event.title}
                  </Link>
                  <ReportStateBadge state="missing" />
                </ItemTitle>
                <ItemDescription>
                  {(event.startsAt ?? event.endsAt) ? (
                    <LocalDate value={event.startsAt ?? event.endsAt ?? ""} format="datetime" />
                  ) : null}
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
                      params={{ nodeId: event.ownerNodeId ?? nodeId, activityId: event.id }}
                    />
                  }
                >
                  {translate("events.submitReport")}
                </Button>
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      ) : showAllReported && anyEnded ? (
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
