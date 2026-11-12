import { CalendarDotsIcon, XIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useApiClient } from "@/app";
import {
  Button,
  EmptyState,
  LocalDate,
  PageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components";
import { ReportStatusBadge } from "@/components/discovery/report-status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNow } from "@/hooks/use-client";
import {
  resolveAppLocale,
  translateAppMessage,
  useAppLocale,
  useAppTranslation,
} from "@/i18n/runtime";
import { eventReportStatus, reportedWithinWeek } from "@/lib/event-reports";
import { formatReportMonth, isReportMonth } from "@/lib/monthly-reports";
import { pageTitle } from "@/lib/page-title";
import { adminEventsQueryOptions } from "@/lib/queries/engagement";
import {
  EVENTS_WHEN,
  type EventsReportFilter,
  type EventsWhen,
  parseEventsReportFilter,
  parseEventsWhen,
  selectAdminEvents,
} from "./-admin-events";
import { ListSkeleton, LoadError } from "./-admin-ui";

type AdminEventsSearch = {
  when?: EventsWhen;
  community?: string;
  month?: string;
  report?: EventsReportFilter;
};

const ALL_COMMUNITIES = "all";

export const Route = createFileRoute("/_admin/_dashboard/admin/events")({
  validateSearch: (search: Record<string, unknown>): AdminEventsSearch => ({
    when: parseEventsWhen(search.when),
    community: typeof search.community === "string" ? search.community : undefined,
    month:
      typeof search.month === "string" && isReportMonth(search.month) ? search.month : undefined,
    report: parseEventsReportFilter(search.report),
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.eventsAdmin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminEvents,
});

function AdminEvents() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const navigate = Route.useNavigate();
  const { when = "past", community, month, report } = Route.useSearch();
  const { locale } = useAppLocale();
  const now = useNow(60_000);
  const eventsQuery = useQuery(adminEventsQueryOptions(apiClient));
  const events = eventsQuery.data?.events ?? [];

  const communities = useMemo(() => {
    const names = new Map<string, string>();
    for (const event of events) names.set(event.nodeId, event.nodeName);
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [events]);
  const selected = useMemo(
    () => selectAdminEvents(events, { when, nodeId: community, month, now }),
    [events, when, community, month, now],
  );
  const missingOnly = when === "past" && report === "missing";
  const reviewOnly = when === "past" && report === "review";
  const visible = missingOnly
    ? selected.filter(
        (event) => eventReportStatus(event, event.reportSubmittedAt, now).state === "missing",
      )
    : reviewOnly
      ? selected.filter((event) => event.reportSubmittedAt && !event.reportReviewedAt)
      : selected;
  const measure = when === "past" ? reportedWithinWeek(selected, now) : null;

  return (
    <>
      <PageHeader
        title={translate("events.title")}
        description={translate("admin.events.description")}
        headerTestId="admin-events.heading"
      />

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs
            value={when}
            onValueChange={(value) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  when: parseEventsWhen(value) === "upcoming" ? "upcoming" : undefined,
                }),
              })
            }
          >
            <TabsList>
              {EVENTS_WHEN.map((value) => (
                <TabsTrigger key={value} value={value} data-testid={`admin-events-${value}`}>
                  {translate(value === "past" ? "admin.events.past" : "admin.events.upcoming")}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Select
            value={community ?? ALL_COMMUNITIES}
            items={[
              { label: translate("admin.events.allCommunities"), value: ALL_COMMUNITIES },
              ...communities.map(([value, label]) => ({ label, value })),
            ]}
            onValueChange={(value) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  community: value && value !== ALL_COMMUNITIES ? value : undefined,
                }),
              })
            }
          >
            <SelectTrigger
              aria-label={translate("admin.events.filterCommunity")}
              className="w-full sm:w-auto"
              data-testid="admin-events-community"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COMMUNITIES}>
                {translate("admin.events.allCommunities")}
              </SelectItem>
              {communities.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {when === "past" && (
            <>
              <Button
                variant={missingOnly ? "default" : "outline"}
                size="sm"
                aria-pressed={missingOnly}
                data-testid="admin-events-missing"
                onClick={() =>
                  void navigate({
                    search: (previous) => ({
                      ...previous,
                      report: missingOnly ? undefined : "missing",
                    }),
                  })
                }
              >
                {translate("admin.events.missingOnly")}
              </Button>
              <Button
                variant={reviewOnly ? "default" : "outline"}
                size="sm"
                aria-pressed={reviewOnly}
                data-testid="admin-events-review"
                onClick={() =>
                  void navigate({
                    search: (previous) => ({
                      ...previous,
                      report: reviewOnly ? undefined : "review",
                    }),
                  })
                }
              >
                {translate("admin.events.toReviewOnly")}
              </Button>
            </>
          )}
          {month && (
            <Button
              variant="ghost"
              size="sm"
              data-testid="admin-events-month"
              onClick={() =>
                void navigate({ search: (previous) => ({ ...previous, month: undefined }) })
              }
            >
              {translate("admin.events.monthFilter", {
                month: formatReportMonth(month, locale),
              })}
              <XIcon />
            </Button>
          )}
        </div>
        {measure && measure.due > 0 && (
          <p className="text-sm text-muted-foreground" data-testid="admin-events-measure">
            {translate("admin.events.onTimeMeasure", {
              onTime: measure.onTime,
              due: measure.due,
              percent: Math.round((measure.onTime / measure.due) * 100),
            })}
          </p>
        )}

        {eventsQuery.isError ? (
          <LoadError
            message={translate("admin.events.failed")}
            onRetry={() => void eventsQuery.refetch()}
            testId="admin-events-error"
          />
        ) : eventsQuery.isLoading ? (
          <ListSkeleton rows={5} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={CalendarDotsIcon}
            title={translate(
              missingOnly
                ? "admin.events.noMissing"
                : reviewOnly
                  ? "admin.events.noneToReview"
                  : when === "past"
                    ? "admin.events.noPast"
                    : "admin.events.noUpcoming",
            )}
            className="py-10"
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Table data-testid="admin-events">
              <TableHeader>
                <TableRow>
                  <TableHead>{translate("admin.events.event")}</TableHead>
                  <TableHead>{translate("common.community")}</TableHead>
                  <TableHead>{translate("admin.events.date")}</TableHead>
                  {when === "past" && (
                    <>
                      <TableHead className="text-right">
                        {translate("admin.events.checkIns")}
                      </TableHead>
                      <TableHead className="text-right">
                        {translate("admin.progress.returning")}
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        {translate("admin.events.synced")}
                      </TableHead>
                      <TableHead>{translate("admin.events.report")}</TableHead>
                    </>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((event) => (
                  <TableRow key={event.id} data-testid={`admin-event-${event.id}`}>
                    <TableCell>
                      {event.publicPage ? (
                        <Link
                          to="/activity/$activityId"
                          params={{ activityId: event.id }}
                          search={{ node: event.nodeId }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {event.title}
                        </Link>
                      ) : (
                        <Link
                          to="/nodes/$nodeId/content"
                          params={{ nodeId: event.nodeId }}
                          search={{ tab: "events" }}
                          className="font-medium text-foreground hover:underline"
                        >
                          {event.title}
                        </Link>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/admin/nodes/$nodeId"
                        params={{ nodeId: event.nodeId }}
                        search={{}}
                        className="text-foreground hover:underline"
                      >
                        {event.nodeName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.startsAt ? <LocalDate value={event.startsAt} /> : "—"}
                    </TableCell>
                    {when === "past" && (
                      <>
                        <TableCell
                          className="text-right tabular-nums"
                          data-testid="admin-event-check-ins"
                        >
                          {event.checkIns ? event.checkIns.people : "—"}
                        </TableCell>
                        <TableCell
                          className="text-right tabular-nums"
                          data-testid="admin-event-returning"
                        >
                          {event.checkIns ? event.checkIns.returning : "—"}
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {!event.checkIns?.syncedAt ? (
                            translate("admin.events.notSynced")
                          ) : event.checkIns.partial ? (
                            translate("admin.events.partial")
                          ) : (
                            <LocalDate value={event.checkIns.syncedAt} format="relative" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/nodes/$nodeId/events/$activityId/report"
                            params={{ nodeId: event.nodeId, activityId: event.id }}
                            data-testid={`admin-event-report-${event.id}`}
                          >
                            <ReportStatusBadge
                              activity={event}
                              submittedAt={event.reportSubmittedAt}
                              reviewedAt={event.reportReviewedAt}
                              now={now}
                            />
                          </Link>
                        </TableCell>
                      </>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {when === "past" && (
              <p className="text-xs text-muted-foreground">{translate("admin.events.syncNote")}</p>
            )}
          </div>
        )}
      </section>
    </>
  );
}
