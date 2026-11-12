import { CheckCircleIcon, TreeStructureIcon, UsersIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { useApiClient } from "@/app";
import { Badge, Button, EmptyState, LocalDate, SectionHeader } from "@/components";
import { ItemGroup } from "@/components/ui/item";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSeenOnce } from "@/hooks";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import {
  communityEngagementQueryOptions,
  platformAttendanceQueryOptions,
} from "@/lib/queries/engagement";
import { onboardingJoinsQueryOptions, utcMonth } from "@/lib/queries/onboarding-joins";
import { tenantsQueryOptions } from "@/lib/queries/tenants";
import {
  attendanceCoverage,
  type StakingState,
} from "@/routes/_admin/_dashboard/admin/-admin-progress";
import {
  Disclosure,
  ListSkeleton,
  LoadError,
  StatFigure,
  StatGrid,
} from "@/routes/_admin/_dashboard/admin/-admin-ui";
import { CommunityJoinTrend } from "@/routes/_admin/_dashboard/admin/-community-join-chart";
import {
  buildCommunityJoinRows,
  COMMUNITY_JOINS_LIMIT,
  visibleCommunityJoinRows,
} from "@/routes/_admin/_dashboard/admin/-community-joins";
import {
  CommunityRewardsBadge,
  CommunityRewardsStat,
  useCommunityRewards,
} from "@/routes/_admin/_dashboard/admin/-community-rewards-ui";
import {
  NeedsActionRow,
  needsActionKey,
  type PlatformStatus,
} from "@/routes/_admin/_dashboard/admin/-platform-status";

export function NeedsAction({ status }: { status: PlatformStatus }) {
  const translate = useAppTranslation();
  const { items, loading, failed, retry, reviewTotal } = status;

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("admin.action.title")}
        description={translate("admin.action.description")}
        sectionTestId="admin.section.needs-action"
        action={
          reviewTotal ? (
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/admin/proposals" search={{ status: "pending" }} />}
            >
              {translate("admin.action.allApplications", { count: reviewTotal })}
            </Button>
          ) : undefined
        }
      />
      {failed && (
        <LoadError
          message={translate("admin.action.failed")}
          onRetry={retry}
          testId="admin-needs-action-error"
        />
      )}
      {loading ? (
        <ListSkeleton rows={3} />
      ) : items.length === 0 ? (
        failed ? null : (
          <EmptyState
            icon={CheckCircleIcon}
            title={translate("admin.caughtUp")}
            description={translate("admin.action.empty")}
            className="py-8"
          />
        )
      ) : (
        <ItemGroup data-testid="admin-needs-action">
          {items.map((item) => (
            <NeedsActionRow key={needsActionKey(item)} item={item} />
          ))}
        </ItemGroup>
      )}
    </section>
  );
}

const STAKING_LABELS: Record<
  StakingState,
  { label: AppMessageId; variant: "success" | "secondary" | "warning" }
> = {
  own: { label: "admin.progress.stakingOwn", variant: "success" },
  below: { label: "admin.progress.stakingBelow", variant: "secondary" },
  inherited: { label: "admin.progress.stakingInherited", variant: "secondary" },
  none: { label: "admin.progress.stakingNone", variant: "warning" },
};

export function CommunityProgress({ progress }: { progress: PlatformStatus["progress"] }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const { rows, isLoading, isError, retry } = progress;
  const engagementQuery = useQuery(communityEngagementQueryOptions(apiClient));
  const engagement = useMemo(
    () =>
      new Map((engagementQuery.data?.communities ?? []).map((row) => [row.organizationId, row])),
    [engagementQuery.data],
  );
  const engagementCell = (value: ReactNode) =>
    engagementQuery.isError
      ? translate("admin.loadFailed")
      : engagementQuery.isLoading
        ? "…"
        : value;
  const [showAll, setShowAll] = useState(false);
  const visibleRows = visibleCommunityJoinRows(rows, showAll);
  const [sectionRef, seen] = useSeenOnce<HTMLElement>();
  const rewards = useCommunityRewards(isLoading || isError || !seen ? [] : rows);

  return (
    <section ref={sectionRef} className="flex flex-col gap-6">
      <SectionHeader
        title={translate("admin.progress.title")}
        description={translate("admin.progress.description")}
        sectionTestId="admin.section.progress"
      />
      {!isLoading && !isError && rows.length > 0 && (
        <StatGrid>
          <CommunityRewardsStat
            summary={seen ? rewards.summary : { ...rewards.summary, loading: true }}
            onRetry={rewards.retryUnreadable}
          />
        </StatGrid>
      )}
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <LoadError
          message={translate("admin.progress.failed")}
          onRetry={retry}
          testId="admin-progress-error"
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={TreeStructureIcon}
          title={translate("admin.progress.empty")}
          description={translate("admin.progress.emptyDescription")}
          className="py-10"
        />
      ) : (
        <div className="flex flex-col gap-3">
          <Table data-testid="admin-progress">
            <TableHeader>
              <TableRow>
                <TableHead>{translate("common.community")}</TableHead>
                <TableHead className="text-right">
                  {translate("admin.redemptions.thisMonth")}
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  {translate("admin.redemptions.newThisMonth")}
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {translate("admin.progress.members")}
                </TableHead>
                <TableHead className="hidden text-right lg:table-cell">
                  {translate("admin.progress.returning")}
                </TableHead>
                <TableHead className="text-right">{translate("admin.progress.events")}</TableHead>
                <TableHead>{translate("common.staking")}</TableHead>
                <TableHead>{translate("admin.progress.rewards")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {translate("admin.progress.lastActivity")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const staking = STAKING_LABELS[row.staking];
                const community = row.tenant.orgId ? engagement.get(row.tenant.orgId) : undefined;
                return (
                  <TableRow key={row.node.id} data-testid={`admin-progress-row-${row.node.id}`}>
                    <TableCell>
                      <Link
                        to="/admin/nodes/$nodeId"
                        params={{ nodeId: row.node.id }}
                        search={{}}
                        className="font-medium text-foreground hover:underline"
                        data-testid="admin-progress-link"
                      >
                        {row.node.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.joins?.redeemed ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {row.joins?.newMembers ?? "—"}
                    </TableCell>
                    <TableCell
                      className="hidden text-right tabular-nums lg:table-cell"
                      data-testid="admin-progress-members"
                    >
                      {engagementCell(community?.memberCount?.count ?? "—")}
                    </TableCell>
                    <TableCell
                      className="hidden text-right tabular-nums lg:table-cell"
                      data-testid="admin-progress-returning"
                    >
                      {engagementCell(
                        community?.checkIns
                          ? translate("admin.progress.returningValue", {
                              returning: community.checkIns.returning,
                              people: community.checkIns.people,
                            })
                          : "—",
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span data-testid="admin-progress-events">
                        {translate("admin.progress.eventsValue", {
                          upcoming: row.events.upcoming,
                          past: row.events.past,
                        })}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={staking.variant} data-testid="admin-progress-staking">
                        {translate(staking.label)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <CommunityRewardsBadge read={rewards.byNode.get(row.node.id)} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {row.lastActivityAt ? (
                        <LocalDate value={row.lastActivityAt} format="relative" />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">
            {translate("admin.progress.engagementNote")}
          </p>
          {engagementQuery.isError && (
            <LoadError
              message={translate("admin.loadFailed")}
              onRetry={() => void engagementQuery.refetch()}
              testId="admin-progress-engagement-error"
            />
          )}
          {rows.length > COMMUNITY_JOINS_LIMIT && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => setShowAll((value) => !value)}
              data-testid="admin-progress-toggle"
            >
              {showAll
                ? translate("admin.redemptions.showTop", { count: COMMUNITY_JOINS_LIMIT })
                : translate("admin.redemptions.showAll", { count: rows.length })}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

export function OnboardingOverview({ status }: { status: PlatformStatus }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const tenantsQuery = useQuery(tenantsQueryOptions(apiClient));
  const currentQuery = useQuery(onboardingJoinsQueryOptions(apiClient, utcMonth(0)));
  const previousQuery = useQuery(onboardingJoinsQueryOptions(apiClient, utcMonth(-1)));
  const attendanceQuery = useQuery(platformAttendanceQueryOptions(apiClient, utcMonth(0)));
  const previousAttendanceQuery = useQuery(platformAttendanceQueryOptions(apiClient, utcMonth(-1)));
  const engagementQuery = useQuery(communityEngagementQueryOptions(apiClient));
  const coverage =
    engagementQuery.data && !status.progress.isLoading
      ? attendanceCoverage(status.progress.rows, engagementQuery.data.communities)
      : null;
  const tableQueries = [tenantsQuery, currentQuery, previousQuery];
  const [showAll, setShowAll] = useState(false);
  const lastMonth = (count: number | undefined) =>
    count === undefined ? undefined : translate("admin.community.lastMonthCount", { count });

  const rows = useMemo(
    () => buildCommunityJoinRows(tenantsQuery.data ?? [], currentQuery.data, previousQuery.data),
    [tenantsQuery.data, currentQuery.data, previousQuery.data],
  );
  const visibleRows = visibleCommunityJoinRows(rows, showAll);

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("admin.onboarding.title")}
        description={translate("admin.onboarding.description")}
        sectionTestId="admin.section.joins"
      />
      <StatGrid>
        <StatFigure
          label={translate("admin.redeemedThisMonth")}
          value={currentQuery.data?.totals.redeemed ?? "—"}
          hint={lastMonth(previousQuery.data?.totals.redeemed)}
          onRetry={currentQuery.isError ? () => void currentQuery.refetch() : undefined}
          testId="admin.stat.redeemed"
        />
        <StatFigure
          label={translate("admin.newMembersThisMonth")}
          value={currentQuery.data?.totals.newMembers ?? "—"}
          hint={lastMonth(previousQuery.data?.totals.newMembers)}
          onRetry={currentQuery.isError ? () => void currentQuery.refetch() : undefined}
          testId="admin.stat.new-members"
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
          testId="admin.stat.returning"
        />
      </StatGrid>
      {coverage && (coverage.synced < coverage.total || coverage.partial > 0) && (
        <p className="text-sm text-muted-foreground" data-testid="admin.coverage">
          {translate(
            coverage.partial > 0 ? "admin.summary.coveragePartial" : "admin.summary.coverage",
            coverage,
          )}
        </p>
      )}
      {tenantsQuery.isError ? (
        <LoadError
          message={translate("admin.redemptions.failed")}
          onRetry={() => void tenantsQuery.refetch()}
          testId="admin-joins-error"
        />
      ) : (
        <CommunityJoinTrend tenants={tenantsQuery.data} />
      )}
      <Disclosure
        label={translate("admin.redemptions.showTable")}
        openLabel={translate("admin.redemptions.hideTable")}
        testId="admin-joins-table-toggle"
      >
        {tableQueries.some((query) => query.isLoading) ? (
          <ListSkeleton rows={3} />
        ) : tableQueries.some((query) => query.isError) ? null : rows.length === 0 ? (
          <EmptyState
            icon={UsersIcon}
            title={translate("admin.redemptions.empty")}
            description={translate("admin.redemptions.emptyDescription")}
            className="py-10"
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Table data-testid="admin-joins">
              <TableHeader>
                <TableRow>
                  <TableHead>{translate("common.community")}</TableHead>
                  <TableHead className="text-right">
                    {translate("admin.redemptions.thisMonth")}
                  </TableHead>
                  <TableHead className="text-right">
                    {translate("admin.redemptions.newThisMonth")}
                  </TableHead>
                  <TableHead className="text-right">
                    {translate("admin.redemptions.lastMonth")}
                  </TableHead>
                  <TableHead className="hidden text-right md:table-cell">
                    {translate("admin.redemptions.newLastMonth")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow key={row.tenant.id} data-testid={`admin-joins-row-${row.tenant.id}`}>
                    <TableCell>
                      <Link
                        to="/tenant/$tenantId"
                        params={{ tenantId: row.tenant.id }}
                        className="font-medium text-foreground hover:underline"
                        data-testid="admin-joins-link"
                      >
                        {row.tenant.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="tabular-nums" data-testid="admin-joins-this-month">
                        {row.thisMonth.redeemed}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="tabular-nums" data-testid="admin-joins-new-this-month">
                        {row.thisMonth.newMembers}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className="tabular-nums text-muted-foreground"
                        data-testid="admin-joins-last-month"
                      >
                        {row.lastMonth.redeemed}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right md:table-cell">
                      <span
                        className="tabular-nums text-muted-foreground"
                        data-testid="admin-joins-new-last-month"
                      >
                        {row.lastMonth.newMembers}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > COMMUNITY_JOINS_LIMIT && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start"
                onClick={() => setShowAll((value) => !value)}
                data-testid="admin-joins-toggle"
              >
                {showAll
                  ? translate("admin.redemptions.showTop", { count: COMMUNITY_JOINS_LIMIT })
                  : translate("admin.redemptions.showAll", { count: rows.length })}
              </Button>
            )}
          </div>
        )}
      </Disclosure>
    </section>
  );
}
