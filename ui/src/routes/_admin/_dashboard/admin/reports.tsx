import { ClipboardTextIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { useApiClient } from "@/app";
import {
  Badge,
  Button,
  EmptyState,
  LocalDate,
  PageHeader,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components";
import { CopyReportLink, ReviewButton } from "@/components/discovery/report-review";
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
import { formatReportMonth, reportableMonthsUntil, reportMonth } from "@/lib/monthly-reports";
import { pageTitle } from "@/lib/page-title";
import { adminMonthlyReportsQueryOptions } from "@/lib/queries/monthly-reports";
import {
  type AdminMonthlyRow,
  filterReportRows,
  parseReportsFilter,
  parseReportsMonth,
  type ReportsFilter,
  summarizeReports,
} from "./-admin-reports";
import { ListSkeleton, LoadError } from "./-admin-ui";

type AdminReportsSearch = { month?: string; show?: ReportsFilter };

const ALL = "all";

export const Route = createFileRoute("/_admin/_dashboard/admin/reports")({
  validateSearch: (search: Record<string, unknown>): AdminReportsSearch => ({
    month: parseReportsMonth(search.month, Date.now()),
    show: parseReportsFilter(search.show),
  }),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "reports.title",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminReports,
});

function AdminReports() {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const apiClient = useApiClient();
  const navigate = Route.useNavigate();
  const now = useNow(60_000);
  const { month: requested, show } = Route.useSearch();
  const current = reportMonth(now);
  const month = requested ?? current;
  const months = reportableMonthsUntil(now);
  const reportsQuery = useQuery(adminMonthlyReportsQueryOptions(apiClient, month));
  const rows = reportsQuery.data?.communities ?? [];
  const visible = filterReportRows(rows, show);
  const summary = summarizeReports(rows);

  return (
    <>
      <PageHeader
        title={translate("reports.title")}
        description={translate("admin.reports.description")}
        headerTestId="admin-reports.heading"
      />

      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Select
            value={month}
            items={months.map((value) => ({
              label: formatReportMonth(value, locale),
              value,
            }))}
            onValueChange={(value) =>
              void navigate({
                search: (previous) => ({
                  ...previous,
                  month: value && value !== current ? value : undefined,
                }),
              })
            }
          >
            <SelectTrigger
              aria-label={translate("admin.reports.chooseMonth")}
              className="w-full sm:w-auto"
              data-testid="admin-reports-month"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((value) => (
                <SelectItem key={value} value={value}>
                  {formatReportMonth(value, locale)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Tabs
            value={show ?? ALL}
            onValueChange={(value) =>
              void navigate({
                search: (previous) => ({ ...previous, show: parseReportsFilter(value) }),
              })
            }
          >
            <TabsList>
              <TabsTrigger value={ALL} data-testid="admin-reports-filter-all">
                {translate("admin.reports.all")}
              </TabsTrigger>
              <TabsTrigger value="missing" data-testid="admin-reports-filter-missing">
                {translate("admin.reports.missing")}
              </TabsTrigger>
              <TabsTrigger value="review" data-testid="admin-reports-filter-review">
                {translate("admin.events.toReviewOnly")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {reportsQuery.isError ? (
          <LoadError
            message={translate("admin.reports.failed")}
            onRetry={() => void reportsQuery.refetch()}
            testId="admin-reports-error"
          />
        ) : reportsQuery.isLoading ? (
          <ListSkeleton rows={5} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground" data-testid="admin-reports-summary">
              {translate(
                month < current ? "admin.reports.summary" : "admin.reports.summaryOpen",
                summary,
              )}
            </p>
            {visible.length === 0 ? (
              <EmptyState
                icon={ClipboardTextIcon}
                title={translate(show ? "admin.reports.noneMatch" : "admin.reports.empty")}
                className="py-10"
              />
            ) : (
              <Table data-testid="admin-reports">
                <TableHeader>
                  <TableRow>
                    <TableHead>{translate("common.community")}</TableHead>
                    <TableHead>{translate("admin.reports.monthly")}</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      {translate("admin.reports.numbersHeading")}
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      {translate("admin.reports.events")}
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="sr-only">{translate("admin.reports.actions")}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <ReportRow key={row.nodeId} row={row} month={month} due={month < current} />
                  ))}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </section>
    </>
  );
}

function ReportRow({ row, month, due }: { row: AdminMonthlyRow; month: string; due: boolean }) {
  const translate = useAppTranslation();
  const { report, events } = row;
  return (
    <TableRow data-testid={`admin-report-${row.nodeId}`}>
      <TableCell className="whitespace-normal">
        <Link
          to="/admin/nodes/$nodeId"
          params={{ nodeId: row.nodeId }}
          search={{}}
          className="font-medium text-foreground hover:underline"
        >
          {row.name}
        </Link>
      </TableCell>
      <TableCell className="whitespace-normal">
        <div className="flex flex-col items-start gap-1">
          <MonthlyStatusBadge row={row} due={due} />
          {report && (
            <span className="text-xs text-muted-foreground">
              {report.submittedByName ? (
                <Trans
                  id="admin.reports.submittedBy"
                  values={{ name: report.submittedByName }}
                  components={{ date: <LocalDate value={report.submittedAt} /> }}
                />
              ) : (
                <LocalDate value={report.submittedAt} />
              )}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">
        {report ? translate("admin.reports.numbers", report.stats) : "—"}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {events.ended === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <Link
              to="/admin/events"
              search={{
                community: row.nodeId,
                month,
                report: events.reported < events.ended ? "missing" : undefined,
              }}
              className="text-foreground hover:underline"
              data-testid={`admin-report-events-${row.nodeId}`}
            >
              {translate("admin.reports.eventsReported", {
                reported: events.reported,
                ended: events.ended,
              })}
            </Link>
            {events.toReview > 0 && (
              <Link
                to="/admin/events"
                search={{ community: row.nodeId, month, report: "review" }}
                className="text-xs text-muted-foreground hover:underline"
                data-testid={`admin-report-events-review-${row.nodeId}`}
              >
                {translate("admin.reports.eventsToReview", { count: events.toReview })}
              </Link>
            )}
          </div>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
          {report ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                nativeButton={false}
                render={
                  <Link to="/nodes/$nodeId/reports/$month" params={{ nodeId: row.nodeId, month }} />
                }
                data-testid={`admin-report-read-${row.nodeId}`}
              >
                {translate("admin.reports.read")}
              </Button>
              <ReviewButton
                target={{ kind: "monthly", nodeId: row.nodeId, month }}
                reviewed={!!report.reviewedAt}
                testId={`admin-report-review-${row.nodeId}`}
              />
            </>
          ) : row.slug ? (
            <CopyReportLink slug={row.slug} testId={`admin-report-copy-${row.nodeId}`} />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function MonthlyStatusBadge({ row, due }: { row: AdminMonthlyRow; due: boolean }) {
  const translate = useAppTranslation();
  const testId = `admin-report-status-${row.nodeId}`;
  if (row.status === "reviewed") {
    return (
      <Badge variant="success" data-testid={testId}>
        {translate("report.status.reviewed")}
      </Badge>
    );
  }
  if (row.status === "submitted") {
    return (
      <Badge variant="secondary" data-testid={testId}>
        {translate("report.status.submitted")}
      </Badge>
    );
  }
  return (
    <Badge variant={due ? "warning" : "outline"} data-testid={testId}>
      {translate(due ? "report.status.missing" : "admin.reports.notYet")}
    </Badge>
  );
}
