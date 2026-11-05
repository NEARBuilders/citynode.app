import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { Button, SectionHeader } from "@/components";
import { ItemGroup } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import {
  communityEngagementQueryOptions,
  platformAttendanceQueryOptions,
} from "@/lib/queries/engagement";
import { onboardingJoinsQueryOptions, utcMonth } from "@/lib/queries/onboarding-joins";
import { attendanceCoverage } from "@/routes/_admin/_dashboard/admin/-admin-progress";
import {
  ListSkeleton,
  LoadError,
  StatFigure,
  StatGrid,
} from "@/routes/_admin/_dashboard/admin/-admin-ui";
import {
  NeedsActionRow,
  needsActionKey,
  usePlatformStatus,
} from "@/routes/_admin/_dashboard/admin/-platform-status";

const SUMMARY_ITEMS_LIMIT = 3;

export function PlatformSummary() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const status = usePlatformStatus();
  const currentQuery = useQuery(onboardingJoinsQueryOptions(apiClient, utcMonth(0)));
  const previousQuery = useQuery(onboardingJoinsQueryOptions(apiClient, utcMonth(-1)));
  const attendanceQuery = useQuery(platformAttendanceQueryOptions(apiClient, utcMonth(0)));
  const previousAttendanceQuery = useQuery(platformAttendanceQueryOptions(apiClient, utcMonth(-1)));
  const engagementQuery = useQuery(communityEngagementQueryOptions(apiClient));
  const coverage =
    engagementQuery.data && !status.progress.isLoading
      ? attendanceCoverage(status.progress.rows, engagementQuery.data.communities)
      : null;
  const visibleItems = status.items.slice(0, SUMMARY_ITEMS_LIMIT);
  const lastMonth = (count: number | undefined) =>
    count === undefined ? undefined : translate("admin.community.lastMonthCount", { count });

  return (
    <section className="flex flex-col gap-6" data-testid="home-platform-summary">
      <SectionHeader
        title={translate("admin.summary.title")}
        description={translate("admin.summary.description")}
        action={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/admin" />}>
            {translate("common.openAdmin")}
          </Button>
        }
      />
      <StatGrid>
        <StatFigure
          label={translate("admin.action.title")}
          value={status.loading ? "…" : status.failed ? "—" : status.items.length}
          tone={status.items.length > 0 ? "attention" : "default"}
          onRetry={status.failed ? status.retry : undefined}
          testId="home-platform-needs-action"
        />
        <StatFigure
          label={translate("admin.trend.redeemed")}
          value={currentQuery.data?.totals.redeemed ?? "—"}
          hint={lastMonth(previousQuery.data?.totals.redeemed)}
          onRetry={currentQuery.isError ? () => void currentQuery.refetch() : undefined}
          testId="home-platform-redeemed"
        />
        <StatFigure
          label={translate("admin.trend.newMembers")}
          value={currentQuery.data?.totals.newMembers ?? "—"}
          hint={lastMonth(previousQuery.data?.totals.newMembers)}
          onRetry={currentQuery.isError ? () => void currentQuery.refetch() : undefined}
          testId="home-platform-new-members"
        />
        <StatFigure
          label={translate("admin.progress.returning")}
          value={attendanceQuery.data?.returning ?? "—"}
          hint={
            attendanceQuery.data && (
              <>
                <span className="block">
                  {translate("admin.summary.returningHint", { count: attendanceQuery.data.people })}
                </span>
                <span className="block">{lastMonth(previousAttendanceQuery.data?.returning)}</span>
              </>
            )
          }
          onRetry={attendanceQuery.isError ? () => void attendanceQuery.refetch() : undefined}
          testId="home-platform-returning"
        />
      </StatGrid>
      {coverage && (coverage.synced < coverage.total || coverage.partial > 0) && (
        <p className="text-sm text-muted-foreground" data-testid="home-platform-coverage">
          {translate(
            coverage.partial > 0 ? "admin.summary.coveragePartial" : "admin.summary.coverage",
            coverage,
          )}
        </p>
      )}
      {status.failed && (
        <LoadError
          message={translate("admin.action.failed")}
          onRetry={status.retry}
          testId="home-platform-error"
        />
      )}
      {status.loading ? (
        <ListSkeleton rows={2} />
      ) : visibleItems.length > 0 ? (
        <ItemGroup data-testid="home-platform-items">
          {visibleItems.map((item) => (
            <NeedsActionRow key={needsActionKey(item)} item={item} />
          ))}
          {status.items.length > SUMMARY_ITEMS_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              nativeButton={false}
              render={<Link to="/admin" />}
            >
              {translate("admin.summary.moreItems", {
                count: status.items.length - SUMMARY_ITEMS_LIMIT,
              })}
            </Button>
          )}
        </ItemGroup>
      ) : null}
    </section>
  );
}
