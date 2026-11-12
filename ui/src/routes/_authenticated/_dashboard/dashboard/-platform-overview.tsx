import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { type ApiClient, useApiClient } from "@/app";
import { Button, LocalDate, SectionHeader } from "@/components";
import { ReviewButton } from "@/components/discovery/report-review";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { useNow } from "@/hooks/use-client";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { eventReportStatus } from "@/lib/event-reports";
import { formatReportMonth, reportMonth } from "@/lib/monthly-reports";
import { adminEventsQueryOptions } from "@/lib/queries/engagement";
import { selectAdminEvents } from "@/routes/_admin/_dashboard/admin/-admin-events";
import { summarizeReports } from "@/routes/_admin/_dashboard/admin/-admin-reports";
import {
  ListSkeleton,
  LoadError,
  StatFigure,
  StatGrid,
} from "@/routes/_admin/_dashboard/admin/-admin-ui";
import {
  useMonthlyReports,
  usePlatformStatus,
} from "@/routes/_admin/_dashboard/admin/-platform-status";
import { OverviewEventColumns, OverviewEventRow } from "./-overview-events";
import { CommunityProgress, NeedsAction, OnboardingOverview } from "./-platform-sections";

export const REVIEW_ITEMS_LIMIT = 6;
export const OVERVIEW_EVENTS_LIMIT = 5;

type AdminEvent = Awaited<ReturnType<ApiClient["getAdminEvents"]>>["events"][number];

export function PlatformOverview() {
  const status = usePlatformStatus();
  return (
    <div className="flex flex-col gap-12" data-testid="home-admin-overview">
      <ReportsOverview />
      <NeedsAction status={status} />
      <EventsOverview />
      <OnboardingOverview status={status} />
      <CommunityProgress progress={status.progress} />
    </div>
  );
}

function ReportsOverview() {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const apiClient = useApiClient();
  const now = useNow(60_000);
  const monthly = useMonthlyReports(now);
  const eventsQuery = useQuery(adminEventsQueryOptions(apiClient));
  const months = monthly.map((query) => query.month);
  const inMonths = (event: AdminEvent) => months.includes(event.startsAt?.slice(0, 7) ?? "");
  const events = (eventsQuery.data?.events ?? []).filter(inMonths);
  const review = [
    ...monthly.flatMap((query) =>
      (query.data?.communities ?? [])
        .filter((row) => row.status === "submitted")
        .map((row) => ({ kind: "monthly" as const, month: query.month, row })),
    ),
    ...events
      .filter((event) => event.reportSubmittedAt && !event.reportReviewedAt)
      .map((event) => ({ kind: "event" as const, event })),
  ];
  const failed = [...monthly, eventsQuery].filter((query) => query.isError);
  const loading = [...monthly, eventsQuery].some((query) => query.isLoading);

  return (
    <section className="flex flex-col gap-6" data-testid="home-admin.reports">
      <SectionHeader
        title={translate("reports.title")}
        description={translate("admin.home.reportsDescription")}
        sectionTestId="home-admin.reports-heading"
        action={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to="/admin/reports" />}
            data-testid="home-admin.open-reports"
          >
            {translate("admin.home.openReports")}
          </Button>
        }
      />
      <StatGrid>
        {monthly.map((query) => {
          const summary = query.data ? summarizeReports(query.data.communities) : null;
          const missingEvents = events.filter(
            (event) =>
              event.startsAt?.startsWith(query.month) &&
              eventReportStatus(event, event.reportSubmittedAt, now).state === "missing",
          ).length;
          return (
            <StatFigure
              key={query.month}
              label={translate("admin.home.monthReports", {
                month: formatReportMonth(query.month, locale),
              })}
              value={summary ? `${summary.submitted}/${summary.expected}` : "—"}
              hint={
                summary && (
                  <>
                    <Link
                      to="/admin/reports"
                      search={{ month: query.month, show: "missing" }}
                      className="block hover:underline"
                      data-testid={`home-admin.missing-${query.month}`}
                    >
                      {translate(
                        query.month < reportMonth(now)
                          ? "admin.home.monthlyMissing"
                          : "admin.home.monthlyNotIn",
                        { count: summary.missing },
                      )}
                    </Link>
                    {eventsQuery.isSuccess && missingEvents > 0 && (
                      <Link
                        to="/admin/events"
                        search={{ month: query.month, report: "missing" }}
                        className="block hover:underline"
                        data-testid={`home-admin.events-missing-${query.month}`}
                      >
                        {translate("admin.home.eventsMissing", { count: missingEvents })}
                      </Link>
                    )}
                  </>
                )
              }
              onRetry={query.isError ? () => void query.refetch() : undefined}
              testId={`home-admin.month-${query.month}`}
            />
          );
        })}
        <StatFigure
          label={translate("admin.home.toReview")}
          value={loading ? "…" : failed.length > 0 ? "—" : review.length}
          tone={review.length > 0 ? "attention" : "default"}
          onRetry={
            failed.length > 0
              ? () => {
                  for (const query of failed) void query.refetch();
                }
              : undefined
          }
          testId="home-admin.to-review"
        />
      </StatGrid>
      {loading ? (
        <ListSkeleton rows={2} />
      ) : failed.length > 0 ? null : review.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="home-admin.nothing-to-review">
          {translate("admin.home.nothingToReview")}
        </p>
      ) : (
        <ItemGroup data-testid="home-admin.review-list">
          {review.slice(0, REVIEW_ITEMS_LIMIT).map((item) =>
            item.kind === "monthly" ? (
              <Item
                key={`monthly-${item.row.nodeId}-${item.month}`}
                variant="outline"
                size="sm"
                data-testid={`home-admin.review-monthly-${item.row.nodeId}-${item.month}`}
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full line-clamp-2 sm:line-clamp-1">
                    <Link
                      to="/nodes/$nodeId/reports/$month"
                      params={{ nodeId: item.row.nodeId, month: item.month }}
                      className="min-w-0 hover:underline sm:truncate"
                    >
                      {translate("admin.home.monthlyReportNamed", {
                        name: item.row.name,
                        month: formatReportMonth(item.month, locale),
                      })}
                    </Link>
                  </ItemTitle>
                  {item.row.report && (
                    <ItemDescription>
                      {item.row.report.submittedByName ? (
                        <Trans
                          id="admin.reports.submittedBy"
                          values={{ name: item.row.report.submittedByName }}
                          components={{
                            date: <LocalDate value={item.row.report.submittedAt} />,
                          }}
                        />
                      ) : (
                        <LocalDate value={item.row.report.submittedAt} />
                      )}
                    </ItemDescription>
                  )}
                </ItemContent>
                <ItemActions>
                  <ReviewButton
                    target={{ kind: "monthly", nodeId: item.row.nodeId, month: item.month }}
                    reviewed={false}
                    testId={`home-admin.review-monthly-${item.row.nodeId}-${item.month}-mark`}
                  />
                </ItemActions>
              </Item>
            ) : (
              <Item
                key={`event-${item.event.id}`}
                variant="outline"
                size="sm"
                data-testid={`home-admin.review-event-${item.event.id}`}
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full line-clamp-2 sm:line-clamp-1">
                    <Link
                      to="/nodes/$nodeId/events/$activityId/report"
                      params={{ nodeId: item.event.nodeId, activityId: item.event.id }}
                      className="min-w-0 hover:underline sm:truncate"
                    >
                      {translate("admin.home.eventReportNamed", { title: item.event.title })}
                    </Link>
                  </ItemTitle>
                  <ItemDescription>{item.event.nodeName}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ReviewButton
                    target={{ kind: "event", activityId: item.event.id }}
                    reviewed={false}
                    testId={`home-admin.review-event-${item.event.id}-mark`}
                  />
                </ItemActions>
              </Item>
            ),
          )}
          {review.length > REVIEW_ITEMS_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              nativeButton={false}
              render={<Link to="/admin/reports" search={{ show: "review" }} />}
              data-testid="home-admin.more-to-review"
            >
              {translate("admin.summary.moreItems", { count: review.length - REVIEW_ITEMS_LIMIT })}
            </Button>
          )}
        </ItemGroup>
      )}
    </section>
  );
}

function EventsOverview() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const now = useNow(60_000);
  const eventsQuery = useQuery(adminEventsQueryOptions(apiClient));
  const events = eventsQuery.data?.events ?? [];
  const recent = selectAdminEvents(events, { when: "past", now }).slice(0, OVERVIEW_EVENTS_LIMIT);
  const upcoming = selectAdminEvents(events, { when: "upcoming", now }).slice(
    0,
    OVERVIEW_EVENTS_LIMIT,
  );
  const row = (event: AdminEvent, past: boolean) => (
    <OverviewEventRow
      key={event.id}
      testId={`home-admin.event-${event.id}`}
      title={<EventTitle event={event} />}
      description={
        <>
          {event.nodeName}
          {event.startsAt && (
            <>
              {" · "}
              <LocalDate value={event.startsAt} />
            </>
          )}
        </>
      }
      report={
        past
          ? {
              nodeId: event.nodeId,
              event,
              submittedAt: event.reportSubmittedAt,
              reviewedAt: event.reportReviewedAt,
              now,
            }
          : undefined
      }
    />
  );

  return (
    <section className="flex flex-col gap-6" data-testid="home-admin.events">
      <SectionHeader
        title={translate("events.title")}
        description={translate("admin.home.eventsDescription")}
        sectionTestId="home-admin.events-heading"
        action={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to="/admin/events" />}
          >
            {translate("admin.home.allEvents")}
          </Button>
        }
      />
      {eventsQuery.isError ? (
        <LoadError
          message={translate("admin.events.failed")}
          onRetry={() => void eventsQuery.refetch()}
          testId="home-admin.events-error"
        />
      ) : eventsQuery.isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <OverviewEventColumns
          testId="home-admin.events"
          columns={[
            {
              key: "recent",
              title: translate("admin.home.recentEvents"),
              empty: translate("admin.events.noPast"),
              rows: recent.map((event) => row(event, true)),
            },
            {
              key: "upcoming",
              title: translate("admin.events.upcoming"),
              empty: translate("admin.events.noUpcoming"),
              rows: upcoming.map((event) => row(event, false)),
            },
          ]}
        />
      )}
    </section>
  );
}

function EventTitle({ event }: { event: AdminEvent }) {
  return event.publicPage ? (
    <Link
      to="/activity/$activityId"
      params={{ activityId: event.id }}
      search={{ node: event.nodeId }}
      className="min-w-0 truncate hover:underline"
    >
      {event.title}
    </Link>
  ) : (
    <Link
      to="/nodes/$nodeId/content"
      params={{ nodeId: event.nodeId }}
      search={{ tab: "events" }}
      className="min-w-0 truncate hover:underline"
    >
      {event.title}
    </Link>
  );
}
