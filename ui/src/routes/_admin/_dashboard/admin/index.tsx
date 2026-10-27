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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import { cn } from "cn";
import { Trans } from "everything-dev/ui/i18n";
import { type ComponentType, type ReactElement, type ReactNode, useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VersionCard } from "@/components/version-card";
import type { AppMessageId } from "@/i18n/catalogs";
import {
  resolveAppLocale,
  translateAppMessage,
  useAppLocale,
  useAppTranslation,
} from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { adminNodeListQueryOptions, communityEventStatsQueryOptions } from "@/lib/queries/nodes";
import { onboardingJoinsQueryOptions, utcMonth } from "@/lib/queries/onboarding-joins";
import { organizationRequestsQueryOptions } from "@/lib/queries/organizations";
import { tenantsQueryOptions } from "@/lib/queries/tenants";
import { useRelayerInfoQuery } from "@/lib/use-relayer";
import { communitySetupNeedsAttention } from "@/routes/_authenticated/_dashboard/-application-progress";
import {
  APPLICATION_ITEMS_LIMIT,
  buildCommunityProgressRows,
  deriveNeedsAction,
  type NeedsActionItem,
  type StakingState,
} from "./-admin-progress";
import {
  Disclosure,
  formatNearFigure,
  ListSkeleton,
  LoadError,
  StatFigure,
  StatGrid,
} from "./-admin-ui";
import { CommunityJoinTrend } from "./-community-join-chart";
import {
  buildCommunityJoinRows,
  COMMUNITY_JOINS_LIMIT,
  visibleCommunityJoinRows,
} from "./-community-joins";
import { useRuntimeRows } from "./-runtime-rows";
import {
  awaitingReviewQueryOptions,
  pendingProposalCountQueryOptions,
  proposalTitle,
  proposalTypeLabel,
  stalledSetupsQueryOptions,
} from "./proposals/-proposal-review";

export const Route = createFileRoute("/_admin/_dashboard/admin/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(pendingProposalCountQueryOptions(context.apiClient)),
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

  const pendingQuery = useQuery(pendingProposalCountQueryOptions(apiClient));
  const awaitingQuery = useQuery(awaitingReviewQueryOptions(apiClient, APPLICATION_ITEMS_LIMIT));
  const relayerQuery = useRelayerInfoQuery();
  const requestsQuery = useQuery(organizationRequestsQueryOptions(apiClient));
  const progress = useCommunityProgress();

  const setupsQuery = useQuery(stalledSetupsQueryOptions(apiClient));
  const setups = (setupsQuery.data?.data ?? []).filter(communitySetupNeedsAttention);
  const awaiting = awaitingQuery.data?.data ?? [];
  const pendingTotal = pendingQuery.data?.meta.total;
  const reviewTotal = awaitingQuery.data?.meta.total ?? 0;
  const relayer = relayerQuery.data;
  const relayerNeedsFunding = !!relayer?.accountId && relayer.enabled === false;
  const relayerFailed = relayerQuery.isError && !relayer;
  const requestCount = requestsQuery.data?.length;

  return (
    <>
      <PageHeader
        title={translate("common.admin")}
        subtitle={getAccount(runtimeConfig)}
        headerTestId="admin.heading"
      />

      <section className="flex flex-col gap-6">
        <SectionHeader title={translate("nav.manage")} sectionTestId="admin.section.manage" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ManageTile
            to="/admin/nodes"
            icon={TreeStructureIcon}
            title={translate("common.communities")}
            testId="admin.heading.nodes"
            status={
              progress.isLoading || progress.isError
                ? translate("admin.communitiesDescription")
                : translate("admin.manage.communitiesCount", { count: progress.rows.length })
            }
          />
          <ManageTile
            to="/admin/proposals"
            icon={GavelIcon}
            title={translate("common.proposals")}
            testId="admin.heading.proposals"
            status={
              pendingQuery.isError
                ? translate("admin.loadFailed")
                : pendingTotal
                  ? translate("admin.manage.proposalsPending", { count: pendingTotal })
                  : translate("admin.manage.nothingPending")
            }
            attention={!!pendingTotal || pendingQuery.isError}
            statusTestId="admin.stat.pending-proposals"
          />
          <ManageTile
            to="/admin/tenants"
            icon={BuildingsIcon}
            title={translate("nav.sites")}
            testId="admin.heading.tenants"
            status={translate("admin.sitesDescription")}
          />
          <ManageTile
            to="/admin/organizations"
            icon={UsersIcon}
            title={translate("common.organizations")}
            testId="admin.heading.organizations"
            status={
              requestsQuery.isError
                ? translate("admin.loadFailed")
                : requestCount
                  ? translate("admin.manage.requestsPending", { count: requestCount })
                  : translate("orgApproval.reviewDescription")
            }
            attention={!!requestCount || requestsQuery.isError}
          />
          <ManageTile
            to="/admin/relayer"
            icon={GasPumpIcon}
            title={translate("nav.relayer")}
            testId="admin.heading.relayer"
            status={
              relayerFailed
                ? translate("admin.loadFailed")
                : relayerQuery.isLoading
                  ? translate("common.loading")
                  : relayer?.enabled
                    ? translate("admin.manage.relayerBalance", {
                        balance: formatNearFigure(relayer.balance, locale),
                      })
                    : relayerNeedsFunding
                      ? translate("admin.relayer.needsFunding")
                      : translate("admin.relayer.notConfigured")
            }
            attention={relayerFailed || relayerNeedsFunding}
            statusTestId="admin.stat.relayer"
          />
          <ManageTile
            to="/admin/system"
            icon={GearIcon}
            title={translate("nav.system")}
            testId="admin.heading.system"
            status={translate("admin.systemDescription")}
          />
        </div>
      </section>

      <NeedsAction
        reviewTotal={reviewTotal}
        proposals={[...setups, ...awaiting].map((proposal) => ({
          id: proposal.id,
          pluginId: proposal.pluginId,
          entityId: proposal.entityId,
          reviewStatus: proposal.reviewStatus,
          title: proposalTitle(proposal, translate),
          createdAt: proposal.createdAt,
          setupNeedsAttention: communitySetupNeedsAttention(proposal),
        }))}
        relayerNeedsFunding={relayerNeedsFunding}
        organizationRequestCount={requestCount ?? 0}
        progress={progress}
        sources={[
          setupsQuery,
          awaitingQuery,
          { ...relayerQuery, isError: relayerFailed },
          requestsQuery,
        ]}
      />

      <CommunityProgress progress={progress} />

      <CommunityJoins />

      <VersionCard />

      <RuntimeDetails />
    </>
  );
}

function RuntimeDetails() {
  const translate = useAppTranslation();
  const { auth, runtimeConfig } = Route.useRouteContext();
  const rows = useRuntimeRows({ runtimeConfig, user: auth?.user });
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title={translate("admin.runtime")} />
      <div className="flex flex-col">
        {rows.map((row) => (
          <ContextRow key={row.id} {...row} />
        ))}
      </div>
    </section>
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
  proposals,
  relayerNeedsFunding,
  organizationRequestCount,
  progress,
  sources,
}: {
  reviewTotal: number;
  proposals: Parameters<typeof deriveNeedsAction>[0]["proposals"];
  relayerNeedsFunding: boolean;
  organizationRequestCount: number;
  progress: ReturnType<typeof useCommunityProgress>;
  sources: { isLoading: boolean; isError: boolean; refetch: () => unknown }[];
}) {
  const translate = useAppTranslation();
  const items = deriveNeedsAction({
    pendingReviewCount: reviewTotal,
    proposals,
    relayerNeedsFunding,
    organizationRequestCount,
    communities: progress.rows,
  });
  const loading = progress.isLoading || sources.some((source) => source.isLoading);
  const failed = progress.isError || sources.some((source) => source.isError);

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
          onRetry={() => {
            for (const source of sources) if (source.isError) void source.refetch();
            if (progress.isError) progress.retry();
          }}
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

function needsActionKey(item: NeedsActionItem) {
  if (item.kind === "setup" || item.kind === "application") {
    return `${item.kind}-${item.proposal.id}`;
  }
  if (item.kind === "staking") return `staking-${item.nodeId}`;
  return item.kind;
}

function NeedsActionRow({ item }: { item: NeedsActionItem }) {
  const translate = useAppTranslation();
  const content: {
    icon?: ComponentType<{ className?: string }>;
    title: string;
    description: ReactNode;
    link: ReactElement;
  } = (() => {
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
      case "application":
        return {
          icon: GavelIcon,
          title: translate("admin.action.reviewNamed", { name: item.proposal.title }),
          description: (
            <Trans
              id="admin.submittedTypeDate"
              values={{ type: proposalTypeLabel(item.proposal.pluginId, translate) }}
              components={{ date: <LocalDate value={item.proposal.createdAt} format="relative" /> }}
            />
          ),
          link: (
            <Link
              to="/admin/proposals/$proposalId"
              params={{ proposalId: item.proposal.id }}
              search={{ pluginId: item.proposal.pluginId, entityId: item.proposal.entityId }}
            />
          ),
        };
      case "moreApplications":
        return {
          icon: GavelIcon,
          title: translate("admin.action.moreApplications", { count: item.count }),
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
        {content.icon ? <content.icon /> : <WarningCircleIcon className="text-brand-strong" />}
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

function CommunityProgress({ progress }: { progress: ReturnType<typeof useCommunityProgress> }) {
  const translate = useAppTranslation();
  const { rows, isLoading, isError, retry } = progress;
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
                    <TableCell className="text-right tabular-nums">
                      {row.joins?.redeemed ?? "—"}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">
                      {row.joins?.newMembers ?? "—"}
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
  const tenantsQuery = useQuery(tenantsQueryOptions(apiClient));
  const currentQuery = useQuery(onboardingJoinsQueryOptions(apiClient, utcMonth(0)));
  const previousQuery = useQuery(onboardingJoinsQueryOptions(apiClient, utcMonth(-1)));
  const tableQueries = [tenantsQuery, currentQuery, previousQuery];
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(
    () => buildCommunityJoinRows(tenantsQuery.data ?? [], currentQuery.data, previousQuery.data),
    [tenantsQuery.data, currentQuery.data, previousQuery.data],
  );
  const visibleRows = visibleCommunityJoinRows(rows, showAll);

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader
        title={translate("admin.redemptions.title")}
        sectionTestId="admin.section.joins"
      />
      <StatGrid>
        <StatFigure
          label={translate("admin.redeemedThisMonth")}
          value={currentQuery.data?.totals.redeemed ?? "—"}
          hint={
            previousQuery.data
              ? translate("admin.community.lastMonthCount", {
                  count: previousQuery.data.totals.redeemed,
                })
              : undefined
          }
          onRetry={currentQuery.isError ? () => void currentQuery.refetch() : undefined}
          testId="admin.stat.redeemed"
        />
        <StatFigure
          label={translate("admin.newMembersThisMonth")}
          value={currentQuery.data?.totals.newMembers ?? "—"}
          hint={
            previousQuery.data
              ? translate("admin.community.lastMonthCount", {
                  count: previousQuery.data.totals.newMembers,
                })
              : undefined
          }
          onRetry={currentQuery.isError ? () => void currentQuery.refetch() : undefined}
          testId="admin.stat.new-members"
        />
      </StatGrid>
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

function ManageTile({
  to,
  icon: Icon,
  title,
  status,
  testId,
  statusTestId,
  attention,
}: {
  to: LinkProps["to"];
  icon: ComponentType<{ className?: string }>;
  title: string;
  status: ReactNode;
  testId: string;
  statusTestId?: string;
  attention?: boolean;
}) {
  return (
    <Item variant="outline" size="sm" render={<Link to={to} />}>
      <ItemMedia variant="icon">
        <Icon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          <h3 className="min-w-0 truncate" data-testid={testId}>
            {title}
          </h3>
        </ItemTitle>
        <ItemDescription
          className={attention ? "font-medium text-brand-strong" : undefined}
          data-testid={statusTestId}
        >
          {status}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <CaretRightIcon className="size-4 text-muted-foreground" />
      </ItemActions>
    </Item>
  );
}

function ContextRow({
  id,
  label,
  value,
  mono,
}: {
  id: string;
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      data-testid={`admin.stat.${id}`}
    >
      <span className="text-sm text-muted-foreground" data-testid={`admin.stat.${id}.label`}>
        {label}
      </span>
      <span
        className={cn("text-sm break-all text-foreground sm:text-right", mono && "font-mono")}
        data-testid={`admin.stat.${id}.value`}
      >
        {value}
      </span>
    </div>
  );
}
