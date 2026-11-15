import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ComponentProps, cloneElement, type ReactElement, type ReactNode } from "react";
import { type ApiClient, useApiClient } from "@/app";
import { Button, LocalDate, SectionHeader } from "@/components";
import { ReviewButton, type ReviewTarget, SubmittedBy } from "@/components/discovery/report-review";
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
import { refetchAll } from "@/lib/queries/refetch-all";
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
import { OverviewEventRow, RecentUpcomingEvents } from "./-overview-events";
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
      (query.data?.communities ?? []).flatMap((row) =>
        row.status === "submitted" && row.report
          ? [{ kind: "monthly" as const, month: query.month, row, updatedAt: row.report.updatedAt }]
          : [],
      ),
    ),
    ...events.flatMap((event) =>
      event.reportUpdatedAt && !event.reportReviewedAt
        ? [{ kind: "event" as const, event, updatedAt: event.reportUpdatedAt }]
        : [],
    ),
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
          onRetry={failed.length > 0 ? () => refetchAll(failed) : undefined}
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
              <ReviewItem
                key={`monthly-${item.row.nodeId}-${item.month}`}
                testId={`home-admin.review-monthly-${item.row.nodeId}-${item.month}`}
                target={{
                  kind: "monthly",
                  nodeId: item.row.nodeId,
                  month: item.month,
                  updatedAt: item.updatedAt,
                }}
                link={
                  <Link
                    to="/nodes/$nodeId/reports/$month"
                    params={{ nodeId: item.row.nodeId, month: item.month }}
                  />
                }
                title={translate("admin.home.monthlyReportNamed", {
                  name: item.row.name,
                  month: formatReportMonth(item.month, locale),
                })}
                description={item.row.report && <SubmittedBy {...item.row.report} />}
              />
            ) : (
              <ReviewItem
                key={`event-${item.event.id}`}
                testId={`home-admin.review-event-${item.event.id}`}
                target={{ kind: "event", activityId: item.event.id, updatedAt: item.updatedAt }}
                link={
                  <Link
                    to="/nodes/$nodeId/events/$activityId/report"
                    params={{ nodeId: item.event.nodeId, activityId: item.event.id }}
                  />
                }
                title={translate("admin.home.eventReportNamed", { title: item.event.title })}
                description={item.event.nodeName}
              />
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

function ReviewItem({
  testId,
  target,
  link,
  title,
  description,
}: {
  testId: string;
  target: ReviewTarget;
  link: ReactElement<ComponentProps<"a">>;
  title: string;
  description: ReactNode;
}) {
  return (
    <Item variant="outline" size="sm" data-testid={testId}>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full line-clamp-2 sm:line-clamp-1">
          {cloneElement(link, { className: "min-w-0 hover:underline sm:truncate" }, title)}
        </ItemTitle>
        {description && <ItemDescription>{description}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        <ReviewButton target={target} reviewed={false} testId={`${testId}-mark`} />
      </ItemActions>
    </Item>
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
        <RecentUpcomingEvents
          testId="home-admin.events"
          recent={recent.map((event) => row(event, true))}
          upcoming={upcoming.map((event) => row(event, false))}
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
