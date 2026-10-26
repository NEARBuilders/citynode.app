import {
  BuildingsIcon,
  CaretRightIcon,
  CheckCircleIcon,
  GasPumpIcon,
  GavelIcon,
  GearIcon,
  TreeStructureIcon,
  UsersIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useInfiniteQuery, useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { type ComponentType, type ReactNode, useMemo, useState } from "react";
import { getAccount, useApiClient } from "@/app";
import { Badge, Button, EmptyState, LocalDate, PageHeader, SectionHeader } from "@/components";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppMessageId } from "@/i18n/catalogs";
import {
  resolveAppLocale,
  translateAppMessage,
  useAppLocale,
  useAppTranslation,
} from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { adminNodeListQueryOptions, communityEventStatsQueryOptions } from "@/lib/queries/nodes";
import {
  onboardingJoinsQueryOptions,
  recentUtcMonths,
  utcMonth,
} from "@/lib/queries/onboarding-joins";
import { organizationRequestsQueryOptions } from "@/lib/queries/organizations";
import { tenantsQueryOptions } from "@/lib/queries/tenants";
import { useRelayerInfoQuery } from "@/lib/use-relayer";
import { communitySetupNeedsAttention } from "@/routes/_authenticated/_dashboard/-application-progress";
import {
  buildCommunityProgressRows,
  deriveNeedsAction,
  type NeedsActionItem,
  type StakingState,
} from "./-admin-progress";
import { formatNearFigure, ListSkeleton, LoadError, StatFigure, StatGrid } from "./-admin-ui";
import { CommunityJoinChart } from "./-community-join-chart";
import {
  buildCommunityJoinRows,
  COMMUNITY_JOINS_LIMIT,
  visibleCommunityJoinRows,
} from "./-community-joins";
import {
  adminProposalListQueryOptions,
  proposalTitle,
  proposalTypeLabel,
} from "./proposals/-proposal-review";

const QUEUE_SIZE = 5;
const TREND_MONTHS = 6;

export const Route = createFileRoute("/_admin/_dashboard/admin/")({
  loader: ({ context }) =>
    context.queryClient.ensureInfiniteQueryData(
      adminProposalListQueryOptions(context.apiClient, "pending"),
    ),
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.admin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminOverview,
});

function AdminOverview() {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const { runtimeConfig } = Route.useRouteContext();
  const apiClient = useApiClient();

  const pendingQuery = useInfiniteQuery(adminProposalListQueryOptions(apiClient, "pending"));
  const relayerQuery = useRelayerInfoQuery();
  const joinsQuery = useQuery(onboardingJoinsQueryOptions(apiClient, utcMonth(0)));

  const queue = pendingQuery.data?.pages[0]?.data ?? [];
  const setups = queue.filter(communitySetupNeedsAttention);
  const awaitingReview = queue.filter((proposal) => proposal.reviewStatus === "pending");
  const pendingTotal = pendingQuery.data?.pages[0]?.meta.total;
  const reviewTotal = pendingTotal === undefined ? undefined : pendingTotal - setups.length;
  const relayer = relayerQuery.data;
  const relayerNeedsFunding = !!relayer && relayer.enabled === false && !!relayer.accountId;

  return (
    <>
      <PageHeader
        title={translate("common.admin")}
        subtitle={getAccount(runtimeConfig)}
        headerTestId="admin.heading"
      />

      <StatGrid>
        <StatFigure
          label={translate("admin.waitingReview")}
          value={reviewTotal ?? "—"}
          onRetry={pendingQuery.isError ? () => void pendingQuery.refetch() : undefined}
          tone={reviewTotal ? "attention" : "default"}
          testId="admin.stat.pending-proposals"
        />
        <StatFigure
          label={translate("admin.relayer.balance")}
          value={relayer?.enabled ? formatNearFigure(relayer.balance, locale) : relayer ? "0" : "—"}
          onRetry={relayerQuery.isError ? () => void relayerQuery.refetch() : undefined}
          hint={
            relayer
              ? relayer.enabled
                ? "NEAR"
                : translate("admin.relayer.needsFunding")
              : translate("admin.relayer.notConfigured")
          }
          tone={relayer && !relayer.enabled ? "attention" : "default"}
          testId="admin.stat.relayer"
        />
        <StatFigure
          label={translate("admin.redeemedThisMonth")}
          value={joinsQuery.data?.totals.redeemed ?? "—"}
          onRetry={joinsQuery.isError ? () => void joinsQuery.refetch() : undefined}
          testId="admin.stat.redeemed"
        />
        <StatFigure
          label={translate("admin.newMembersThisMonth")}
          value={joinsQuery.data?.totals.newMembers ?? "—"}
          onRetry={joinsQuery.isError ? () => void joinsQuery.refetch() : undefined}
          testId="admin.stat.new-members"
        />
      </StatGrid>

      <div className="grid gap-12 lg:grid-cols-3 lg:gap-10">
        <div className="flex min-w-0 flex-col gap-12 lg:col-span-2">
          <NeedsAction
            reviewTotal={reviewTotal ?? 0}
            setups={setups.map((proposal) => ({
              id: proposal.id,
              pluginId: proposal.pluginId,
              entityId: proposal.entityId,
              reviewStatus: proposal.reviewStatus,
              title: proposalTitle(proposal, translate),
              setupNeedsAttention: true,
            }))}
            relayerNeedsFunding={relayerNeedsFunding}
            proposalsState={pendingQuery}
          />

          <section className="flex flex-col gap-6">
            <SectionHeader
              title={translate("admin.waitingReview")}
              sectionTestId="admin.section.queue"
              action={
                reviewTotal ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link to="/admin/proposals" search={{ status: "pending" }} />}
                  >
                    {translate("common.seeAllCount", { count: reviewTotal })}
                  </Button>
                ) : undefined
              }
            />
            {pendingQuery.isLoading ? (
              <ListSkeleton rows={3} />
            ) : pendingQuery.isError ? (
              <LoadError
                message={translate("admin.proposalsFailed")}
                onRetry={() => void pendingQuery.refetch()}
              />
            ) : awaitingReview.length === 0 ? (
              <EmptyState
                icon={CheckCircleIcon}
                title={translate("admin.caughtUp")}
                description={translate("admin.queueEmpty")}
                className="py-10"
              />
            ) : (
              <ItemGroup data-testid="admin-queue">
                {awaitingReview.slice(0, QUEUE_SIZE).map((proposal) => (
                  <Item
                    key={proposal.id}
                    variant="outline"
                    render={
                      <Link
                        to="/admin/proposals/$proposalId"
                        params={{ proposalId: proposal.id }}
                        search={{ pluginId: proposal.pluginId, entityId: proposal.entityId }}
                      />
                    }
                    data-testid={`admin-queue-item-${proposal.id}`}
                  >
                    <ItemMedia variant="icon">
                      <GavelIcon />
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="max-w-full">
                        <span className="min-w-0 truncate">
                          {proposalTitle(proposal, translate)}
                        </span>
                      </ItemTitle>
                      <ItemDescription>
                        <Trans
                          id="admin.submittedTypeDate"
                          values={{ type: proposalTypeLabel(proposal.pluginId, translate) }}
                          components={{
                            date: <LocalDate value={proposal.createdAt} format="relative" />,
                          }}
                        />
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <span className="hidden text-sm font-medium sm:inline">
                        {translate("common.review")}
                      </span>
                      <CaretRightIcon className="size-4 text-muted-foreground" />
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6 lg:sticky lg:top-6 lg:self-start">
          <SectionHeader title={translate("nav.manage")} sectionTestId="admin.section.manage" />
          <ItemGroup>
            <ManageRow
              to="/admin/nodes"
              icon={TreeStructureIcon}
              title={translate("common.communities")}
              testId="admin.heading.nodes"
              description={translate("admin.communitiesDescription")}
            />
            <ManageRow
              to="/admin/proposals"
              icon={GavelIcon}
              title={translate("common.proposals")}
              testId="admin.heading.proposals"
              description={translate("admin.proposalsDescription")}
              badge={
                pendingTotal ? (
                  <Badge variant="warning">
                    {pendingTotal} {translate("common.pendingLower")}
                  </Badge>
                ) : null
              }
            />
            <ManageRow
              to="/admin/tenants"
              icon={BuildingsIcon}
              title={translate("nav.sites")}
              testId="admin.heading.tenants"
              description={translate("admin.sitesDescription")}
            />
            <ManageRow
              to="/admin/organizations"
              icon={UsersIcon}
              title={translate("common.organizations")}
              testId="admin.heading.organizations"
              description={translate("orgApproval.reviewDescription")}
            />
            <ManageRow
              to="/admin/relayer"
              icon={GasPumpIcon}
              title={translate("nav.relayer")}
              testId="admin.heading.relayer"
              description={translate("admin.relayerDescription")}
            />
            <ManageRow
              to="/admin/system"
              icon={GearIcon}
              title={translate("nav.system")}
              testId="admin.heading.system"
              description={translate("admin.systemDescription")}
            />
          </ItemGroup>
        </aside>
      </div>

      <CommunityProgress />

      <CommunityJoins />
    </>
  );
}

function useCommunityProgress() {
  const apiClient = useApiClient();
  const tenantsQuery = useQuery(tenantsQueryOptions(apiClient));
  const nodesQuery = useQuery(adminNodeListQueryOptions(apiClient, "all", "all"));
  const joinsQuery = useQuery(onboardingJoinsQueryOptions(apiClient, utcMonth(0)));
  const eventsQuery = useQuery(communityEventStatsQueryOptions(apiClient));
  const queries = [tenantsQuery, nodesQuery, joinsQuery, eventsQuery];
  const rows = useMemo(
    () =>
      buildCommunityProgressRows(
        tenantsQuery.data ?? [],
        nodesQuery.data ?? [],
        joinsQuery.data,
        eventsQuery.data ?? [],
      ),
    [tenantsQuery.data, nodesQuery.data, joinsQuery.data, eventsQuery.data],
  );
  return {
    rows,
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    retry: () => {
      for (const query of queries) if (query.isError) void query.refetch();
    },
  };
}

function NeedsAction({
  reviewTotal,
  setups,
  relayerNeedsFunding,
  proposalsState,
}: {
  reviewTotal: number;
  setups: Parameters<typeof deriveNeedsAction>[0]["proposals"];
  relayerNeedsFunding: boolean;
  proposalsState: { isLoading: boolean; isError: boolean; refetch: () => unknown };
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const requestsQuery = useQuery(organizationRequestsQueryOptions(apiClient));
  const progress = useCommunityProgress();
  const items = deriveNeedsAction({
    pendingReviewCount: reviewTotal,
    proposals: setups,
    relayerNeedsFunding,
    organizationRequestCount: requestsQuery.data?.length ?? 0,
    communities: progress.rows,
  });
  const loading = proposalsState.isLoading || requestsQuery.isLoading || progress.isLoading;
  const failed = proposalsState.isError || requestsQuery.isError || progress.isError;

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("admin.action.title")}
        description={translate("admin.action.description")}
        sectionTestId="admin.section.needs-action"
      />
      {failed && (
        <LoadError
          message={translate("admin.action.failed")}
          onRetry={() => {
            if (proposalsState.isError) void proposalsState.refetch();
            if (requestsQuery.isError) void requestsQuery.refetch();
            if (progress.isError) progress.retry();
          }}
          testId="admin-needs-action-error"
        />
      )}
      {loading ? (
        <ListSkeleton rows={2} />
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

function needsActionKey(item: NeedsActionItem) {
  if (item.kind === "setup") return `setup-${item.proposal.id}`;
  if (item.kind === "staking") return `staking-${item.nodeId}`;
  return item.kind;
}

function NeedsActionRow({ item }: { item: NeedsActionItem }) {
  const translate = useAppTranslation();
  const content = (() => {
    switch (item.kind) {
      case "setup":
        return {
          title: translate("admin.action.setupNamed", { name: item.proposal.title }),
          description: translate("admin.action.setupHint"),
          link: (
            <Link
              to="/admin/proposals/$proposalId"
              params={{ proposalId: item.proposal.id }}
              search={{ pluginId: item.proposal.pluginId, entityId: item.proposal.entityId }}
            />
          ),
        };
      case "relayer":
        return {
          title: translate("admin.relayer.needsFunding"),
          description: translate("admin.relayer.paused"),
          link: <Link to="/admin/relayer" />,
        };
      case "review":
        return {
          title: translate("admin.action.reviewCount", { count: item.count }),
          description: translate("admin.action.reviewHint"),
          link: <Link to="/admin/proposals" search={{ status: "pending" }} />,
        };
      case "organizations":
        return {
          title: translate("admin.action.organizationsCount", { count: item.count }),
          description: translate("orgApproval.reviewDescription"),
          link: <Link to="/admin/organizations" />,
        };
      case "stakingMany":
        return {
          title: translate("admin.action.stakingCount", { count: item.count }),
          description: translate("admin.action.stakingHint"),
          link: <Link to="/admin/nodes" />,
        };
      case "staking":
        return {
          title: translate("admin.action.stakingNamed", { name: item.name }),
          description: translate("admin.action.stakingHint"),
          link: (
            <Link
              to="/admin/nodes/$nodeId"
              params={{ nodeId: item.nodeId }}
              search={{ tab: "validators" }}
            />
          ),
        };
    }
  })();
  return (
    <Item
      variant="outline"
      size="sm"
      render={content.link}
      data-testid={`admin-needs-action-${needsActionKey(item)}`}
    >
      <ItemMedia variant="icon">
        <WarningCircleIcon className="text-brand-strong" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full">
          <span className="min-w-0 truncate">{content.title}</span>
        </ItemTitle>
        <ItemDescription>{content.description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <CaretRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
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

function CommunityProgress() {
  const translate = useAppTranslation();
  const { rows, isLoading, isError, retry } = useCommunityProgress();
  const [showAll, setShowAll] = useState(false);
  const visibleRows = visibleCommunityJoinRows(rows, showAll);

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("admin.progress.title")}
        description={translate("admin.progress.description")}
        sectionTestId="admin.section.progress"
      />
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
                <TableHead className="text-right">{translate("admin.progress.events")}</TableHead>
                <TableHead>{translate("common.staking")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {translate("admin.progress.lastActivity")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((row) => {
                const staking = STAKING_LABELS[row.staking];
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
                    <TableCell className="text-right tabular-nums">{row.joins.redeemed}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {row.joins.newMembers}
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

function CommunityJoins() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const months = recentUtcMonths(TREND_MONTHS);
  const tenantsQuery = useQuery(tenantsQueryOptions(apiClient));
  const monthQueries = useQueries({
    queries: months.map((month) => onboardingJoinsQueryOptions(apiClient, month)),
  });
  const currentQuery = monthQueries[TREND_MONTHS - 1]!;
  const previousQuery = monthQueries[TREND_MONTHS - 2]!;
  const tableQueries = [tenantsQuery, currentQuery, previousQuery];
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(
    () => buildCommunityJoinRows(tenantsQuery.data ?? [], currentQuery.data, previousQuery.data),
    [tenantsQuery.data, currentQuery.data, previousQuery.data],
  );
  const visibleRows = visibleCommunityJoinRows(rows, showAll);
  const chartReady = !tenantsQuery.isLoading && monthQueries.every((query) => query.isSuccess);
  const chartFailed = tenantsQuery.isError || monthQueries.some((query) => query.isError);
  const monthData = months.map((month, index) => ({ month, joins: monthQueries[index]?.data }));
  const retry = () => {
    for (const query of [tenantsQuery, ...monthQueries]) if (query.isError) void query.refetch();
  };

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("admin.redemptions.title")}
        sectionTestId="admin.section.joins"
      />
      {chartFailed ? (
        <LoadError
          message={translate("admin.redemptions.failed")}
          onRetry={retry}
          testId="admin-joins-error"
        />
      ) : chartReady ? (
        <CommunityJoinChart tenants={tenantsQuery.data ?? []} months={monthData} />
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
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
    </section>
  );
}

function ManageRow({
  to,
  icon: Icon,
  title,
  description,
  testId,
  badge,
}: {
  to: LinkProps["to"];
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  testId: string;
  badge?: ReactNode;
}) {
  return (
    <Item variant="outline" size="sm" render={<Link to={to} />}>
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="flex-wrap">
          <h3 className="min-w-0 truncate" data-testid={testId}>
            {title}
          </h3>
          {badge}
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <CaretRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}
