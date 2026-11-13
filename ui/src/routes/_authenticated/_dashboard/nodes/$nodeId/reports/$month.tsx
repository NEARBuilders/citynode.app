import { ArrowLeftIcon, BookOpenIcon, CalendarCheckIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import { type ApiClient, useApiClient } from "@/app";
import { ReportUpdated, ReviewRow } from "@/components/discovery/report-review";
import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import type { AppMessageId } from "@/i18n/catalogs";
import { appErrorMessage } from "@/i18n/error-message";
import {
  resolveAppLocale,
  translateAppMessage,
  useAppLocale,
  useAppTranslation,
} from "@/i18n/runtime";
import {
  formatReportMonth,
  isReportableMonth,
  isReportMonth,
  MONTHLY_REPORT_GUIDE,
  MONTHLY_REPORT_NOTES_MAX,
  reportMonth,
} from "@/lib/monthly-reports";
import { pageTitle } from "@/lib/page-title";
import { attendanceReconcileQueryOptions } from "@/lib/queries/attendance";
import {
  monthlyReportQueryKeys,
  monthlyReportQueryOptions,
  reportCommunitiesQueryOptions,
} from "@/lib/queries/monthly-reports";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import { useReturnToReport } from "@/lib/use-return-to-report";

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId/reports/$month")({
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "reports.monthlyHeading",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: MonthlyReportPage,
});

type MonthlyReport = Awaited<ReturnType<ApiClient["getMonthlyReport"]>>;
type MonthlyStats = NonNullable<MonthlyReport["stats"]>;

const STATS: { key: keyof MonthlyStats; label: AppMessageId }[] = [
  { key: "eventsHeld", label: "reports.stats.eventsHeld" },
  { key: "checkIns", label: "reports.stats.checkIns" },
  { key: "joins", label: "reports.stats.joins" },
  { key: "newMembers", label: "reports.stats.newMembers" },
];

function MonthlyReportPage() {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const { nodeId, month } = Route.useParams();
  const api = useApiClient();
  const valid = isReportMonth(month) && isReportableMonth(month);
  const report = useQuery({ ...monthlyReportQueryOptions(api, nodeId, month), enabled: valid });
  const node = useQuery(nodeByIdQueryOptions(api, nodeId));
  const sync = useCheckInSync(
    nodeId,
    month,
    report.data,
    Math.max(report.dataUpdatedAt, report.errorUpdatedAt),
  );
  const title = valid
    ? translate("reports.monthlyTitle", { month: formatReportMonth(month, locale) })
    : translate("reports.monthlyHeading");

  if (valid && report.isPending) {
    return (
      <MonthlyReportShell title={<Skeleton className="h-10 w-full max-w-64" />}>
        <div className="flex flex-col gap-6" aria-busy="true">
          {["a", "b", "c"].map((key) => (
            <Skeleton key={key} className="h-11 w-full" />
          ))}
        </div>
      </MonthlyReportShell>
    );
  }

  if (!valid || !report.data) {
    return (
      <MonthlyReportShell title={title}>
        <EmptyState
          icon={CalendarCheckIcon}
          title={translate(valid ? "report.loadError" : "reports.monthNotFound")}
          description={report.error ? appErrorMessage(report.error, translate) : undefined}
          action={
            report.isError && (
              <Button
                variant="outline"
                data-testid="monthly-report.retry"
                onClick={() => void report.refetch()}
              >
                {translate("common.retry")}
              </Button>
            )
          }
        />
      </MonthlyReportShell>
    );
  }

  const {
    report: saved,
    canEdit,
    canReview,
    open,
    stats,
    closesAt,
    checkInsSyncedAt,
  } = report.data;
  const editable = canEdit && open;
  const statsFailed = editable && (sync.failed || report.isError);
  const retry = () => {
    if (report.isError) void report.refetch();
    if (sync.failed) sync.retry();
  };
  return (
    <MonthlyReportShell
      title={title}
      backToAdmin={canReview && !canEdit ? month : undefined}
      description={
        <span>
          {node.data?.name}
          {saved && (
            <>
              {node.data?.name ? " · " : ""}
              <ReportUpdated
                updatedAt={saved.updatedAt}
                reviewedAt={saved.reviewedAt}
                reviewedTestId="monthly-report.reviewed-on"
              />
            </>
          )}
        </span>
      }
    >
      {canReview && saved && (
        <ReviewRow
          target={{ kind: "monthly", nodeId, month, updatedAt: saved.updatedAt }}
          reviewedAt={saved.reviewedAt}
          testId="monthly-report.review"
        />
      )}
      {editable && sync.syncing ? (
        <section
          className="flex flex-col gap-3"
          aria-busy="true"
          data-testid="monthly-report.stats-syncing"
        >
          <Skeleton className="h-16 w-full" />
          <p className="text-sm text-muted-foreground">{translate("reports.syncingCheckIns")}</p>
        </section>
      ) : (
        stats && (
          <section className="flex flex-col gap-3" data-testid="monthly-report.stats">
            <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              {STATS.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex flex-col gap-1"
                  data-testid={`monthly-report.${key}`}
                >
                  <dt className="text-sm text-muted-foreground">{translate(label)}</dt>
                  <dd className="text-3xl font-semibold tabular-nums">{stats[key]}</dd>
                  {editable && key === "checkIns" && (
                    <dd
                      className="text-xs text-muted-foreground"
                      data-testid="monthly-report.check-ins-synced"
                    >
                      {checkInsSyncedAt ? (
                        <Trans
                          id="reports.checkInsSynced"
                          components={{
                            date: <LocalDate value={checkInsSyncedAt} format="relative" />,
                          }}
                        />
                      ) : (
                        translate("reports.checkInsNeverSynced")
                      )}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
            {statsFailed && (
              <RefreshAlert
                message="reports.syncFailed"
                onRetry={retry}
                testId="monthly-report.sync-error"
              />
            )}
            <p className="text-sm text-muted-foreground">
              {translate(editable ? "reports.statsLive" : "reports.statsSnapshot")}
            </p>
          </section>
        )
      )}
      {report.isError && !(editable && stats) && (
        <RefreshAlert
          message="report.loadError"
          onRetry={retry}
          testId="monthly-report.refresh-error"
        />
      )}
      {editable ? (
        <MonthlyReportForm
          key={saved?.updatedAt ?? "new"}
          nodeId={nodeId}
          month={month}
          initial={saved?.notes ?? ""}
          isEdit={!!saved}
          waiting={sync.syncing}
        />
      ) : saved ? (
        <section className="flex flex-col gap-2" data-testid="monthly-report.notes">
          <h2 className="text-sm font-medium text-muted-foreground">
            {translate("reports.notesLabel")}
          </h2>
          <p className="whitespace-pre-wrap wrap-anywhere text-foreground">{saved.notes}</p>
        </section>
      ) : (
        <EmptyState icon={CalendarCheckIcon} title={translate("report.notSubmitted")} />
      )}
      {canEdit && !open && (
        <p className="text-sm text-muted-foreground" data-testid="monthly-report.closed">
          {translate("reports.closed", {
            month: formatReportMonth(reportMonth(Date.parse(closesAt), -1), locale),
          })}
        </p>
      )}
    </MonthlyReportShell>
  );
}

function useCheckInSync(
  nodeId: string,
  month: string,
  report: MonthlyReport | undefined,
  reportSettledAt: number,
) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const organizationId = report?.organizationId ?? "";
  const editable = !!report && report.canEdit && report.open && !!organizationId;
  const sync = useQuery({
    ...attendanceReconcileQueryOptions(api, organizationId),
    enabled: editable,
  });
  const stale = editable && sync.isSuccess && sync.dataUpdatedAt > reportSettledAt;
  const holding = editable && (sync.isPending || stale);
  const [firstSyncSettled, setFirstSyncSettled] = useState(false);
  useEffect(() => {
    if (editable && !holding) setFirstSyncSettled(true);
  }, [editable, holding]);
  useEffect(() => {
    if (!stale) return;
    void queryClient.invalidateQueries({
      queryKey: monthlyReportQueryKeys.report(nodeId, month),
    });
  }, [stale, queryClient, nodeId, month]);
  return {
    syncing: holding && !firstSyncSettled,
    failed: editable && (sync.isError || (sync.data?.failed.length ?? 0) > 0),
    retry: () => void sync.refetch(),
  };
}

function RefreshAlert({
  message,
  onRetry,
  testId,
}: {
  message: AppMessageId;
  onRetry: () => void;
  testId: string;
}) {
  const translate = useAppTranslation();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 text-sm text-destructive"
      data-testid={testId}
    >
      <span>{translate(message)}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        {translate("common.retry")}
      </Button>
    </div>
  );
}

function MonthlyReportShell({
  title,
  description,
  backToAdmin,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  backToAdmin?: string;
  children: ReactNode;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const { nodeId } = Route.useParams();
  const communities = useQuery(reportCommunitiesQueryOptions(api));
  const community = communities.data?.communities.find((item) => item.nodeId === nodeId);
  return (
    <PageContainer variant="narrow">
      <div className="flex flex-col gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 self-start"
          nativeButton={false}
          data-testid="monthly-report.back"
          render={
            backToAdmin ? (
              <Link to="/admin/reports" search={{ month: backToAdmin }} />
            ) : (
              <Link to="/report" search={community ? { community: community.slug } : {}} />
            )
          }
        >
          <ArrowLeftIcon />
          {translate("reports.title")}
        </Button>
        <PageHeader
          title={title}
          description={description}
          headerTestId="monthly-report.heading"
          actions={
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link to="/docs/$guide" params={{ guide: MONTHLY_REPORT_GUIDE }} />}
              data-testid="monthly-report.guide"
            >
              <BookOpenIcon />
              {translate("reports.guide")}
            </Button>
          }
        />
      </div>
      {children}
    </PageContainer>
  );
}

function MonthlyReportForm({
  nodeId,
  month,
  initial,
  isEdit,
  waiting,
}: {
  nodeId: string;
  month: string;
  initial: string;
  isEdit: boolean;
  waiting: boolean;
}) {
  const translate = useAppTranslation();
  const api = useApiClient();
  const queryClient = useQueryClient();
  const returnToReport = useReturnToReport();
  const [notes, setNotes] = useState(initial);
  const [missing, setMissing] = useState(false);
  const save = useMutation({
    mutationFn: () => api.saveMonthlyReport({ nodeId, month, notes: notes.trim() }),
    onSuccess: async () => {
      toast.success(translate("report.saved"));
      await queryClient.invalidateQueries({ queryKey: monthlyReportQueryKeys.all });
      await returnToReport({ nodeId });
    },
    onError: (error: Error) => toast.error(appErrorMessage(error, translate)),
  });
  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!notes.trim()) {
          setMissing(true);
          return;
        }
        setMissing(false);
        save.mutate();
      }}
    >
      <Field data-invalid={missing || undefined}>
        <FieldLabel htmlFor="monthly-report-notes">{translate("reports.notesLabel")}</FieldLabel>
        <Textarea
          id="monthly-report-notes"
          data-testid="monthly-report.notes-input"
          value={notes}
          rows={10}
          maxLength={MONTHLY_REPORT_NOTES_MAX}
          aria-invalid={missing || undefined}
          onChange={(event) => setNotes(event.target.value)}
        />
        <FieldDescription>{translate("reports.notesHint")}</FieldDescription>
        {missing && <FieldError>{translate("report.error.required")}</FieldError>}
      </Field>
      <div className="flex gap-2">
        <Button
          type="submit"
          disabled={save.isPending || waiting}
          data-testid="monthly-report.submit"
        >
          {translate(isEdit ? "report.saveChanges" : "report.submit")}
        </Button>
      </div>
    </form>
  );
}
