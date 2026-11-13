import {
  CaretRightIcon,
  ClipboardTextIcon,
  GavelIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import { type ComponentType, type ReactElement, type ReactNode, useMemo } from "react";
import { useApiClient } from "@/app";
import { LocalDate } from "@/components";
import { CopyReportLink } from "@/components/discovery/report-review";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useNow } from "@/hooks/use-client";
import { useAppLocale, useAppTranslation } from "@/i18n/runtime";
import { formatReportMonth, reportMonthsShown } from "@/lib/monthly-reports";
import { adminEventsQueryOptions } from "@/lib/queries/engagement";
import { adminMonthlyReportsQueryOptions } from "@/lib/queries/monthly-reports";
import { adminNodeListQueryOptions, communityEventStatsQueryOptions } from "@/lib/queries/nodes";
import { onboardingJoinsQueryOptions, utcMonth } from "@/lib/queries/onboarding-joins";
import { tenantsQueryOptions } from "@/lib/queries/tenants";
import { useRelayerInfoQuery } from "@/lib/use-relayer";
import { communitySetupNeedsAttention } from "@/routes/_authenticated/_dashboard/-application-progress";
import {
  APPLICATION_ITEMS_LIMIT,
  buildCommunityProgressRows,
  deriveNeedsAction,
  eventHealth,
  type NeedsActionItem,
  type ReportChase,
  reportsToChase,
} from "./-admin-progress";
import {
  awaitingReviewQueryOptions,
  proposalTitle,
  proposalTypeLabel,
  stalledSetupsQueryOptions,
} from "./proposals/-proposal-review";

export function usePlatformStatus() {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const awaitingQuery = useQuery(awaitingReviewQueryOptions(apiClient, APPLICATION_ITEMS_LIMIT));
  const relayerQuery = useRelayerInfoQuery();
  const setupsQuery = useQuery(stalledSetupsQueryOptions(apiClient));
  const progress = useCommunityProgress();
  const eventsQuery = useQuery(adminEventsQueryOptions(apiClient));
  const now = useNow(60_000);
  const monthly = useMonthlyReports(now);
  const health = eventHealth({
    communities: progress.rows,
    events: eventsQuery.data?.events ?? [],
    now,
  });
  const monthlyLoaded = monthly.every((query) => query.isSuccess);
  const reports = reportsToChase({
    monthly: monthlyLoaded
      ? monthly.map((query) => ({
          month: query.month,
          communities: query.data?.communities ?? [],
        }))
      : [],
    overdue: eventsQuery.isSuccess ? health.overdue : [],
    now,
  });

  const setups = (setupsQuery.data?.data ?? []).filter(communitySetupNeedsAttention);
  const awaiting = awaitingQuery.data?.data ?? [];
  const reviewTotal = awaitingQuery.data?.meta.total ?? 0;
  const relayer = relayerQuery.data;
  const relayerNeedsFunding = !!relayer?.accountId && relayer.enabled === false;
  const relayerFailed = relayerQuery.isError && !relayer;
  const sources = [
    setupsQuery,
    awaitingQuery,
    { ...relayerQuery, isError: relayerFailed },
    eventsQuery,
    ...monthly,
  ];

  const items = deriveNeedsAction({
    pendingReviewCount: reviewTotal,
    proposals: [...setups, ...awaiting].map((proposal) => ({
      id: proposal.id,
      pluginId: proposal.pluginId,
      entityId: proposal.entityId,
      reviewStatus: proposal.reviewStatus,
      title: proposalTitle(proposal, translate),
      createdAt: proposal.createdAt,
      setupNeedsAttention: communitySetupNeedsAttention(proposal),
    })),
    relayerNeedsFunding,
    communities: progress.rows,
    quietCommunities: eventsQuery.isSuccess ? health.quiet : [],
    reportChases: monthlyLoaded ? reports.chases : [],
    overdueReports: monthlyLoaded ? reports.unattributed : 0,
  });

  return {
    items,
    progress,
    reviewTotal,
    loading: progress.isLoading || sources.some((source) => source.isLoading),
    failed: progress.isError || sources.some((source) => source.isError),
    retry: () => {
      for (const source of sources) if (source.isError) void source.refetch();
      if (progress.isError) progress.retry();
    },
  };
}

export type PlatformStatus = ReturnType<typeof usePlatformStatus>;

export function useMonthlyReports(now: number) {
  const apiClient = useApiClient();
  const months = reportMonthsShown(now);
  return useQueries({
    queries: months.map((month) => adminMonthlyReportsQueryOptions(apiClient, month)),
  }).map((query, index) => ({ ...query, month: months[index] ?? "" }));
}

export function useCommunityProgress() {
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

export function needsActionKey(item: NeedsActionItem) {
  if (item.kind === "setup" || item.kind === "application") {
    return `${item.kind}-${item.proposal.id}`;
  }
  if (item.kind === "staking") return `staking-${item.nodeId}`;
  if (item.kind === "quiet") return `quiet-${item.nodeId}`;
  if (item.kind === "reportsMissing") return `reports-${item.chase.organizationId}`;
  return item.kind;
}

function ReportChaseRow({ chase }: { chase: ReportChase }) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const [month] = chase.months;
  const key = `reports-${chase.organizationId}`;
  const details = [
    ...chase.months.map((owed) =>
      translate("admin.action.monthlyMissing", { month: formatReportMonth(owed, locale) }),
    ),
    ...(chase.overdueEvents > 0
      ? [translate("admin.action.eventReportsOverdue", { count: chase.overdueEvents })]
      : []),
  ];
  return (
    <Item variant="outline" size="sm" data-testid={`admin-needs-action-${key}`}>
      <ItemMedia variant="icon">
        <ClipboardTextIcon className="text-brand-strong" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full line-clamp-2 sm:line-clamp-1">
          {month ? (
            <Link
              to="/admin/reports"
              search={{ month, show: "missing" }}
              className="min-w-0 hover:underline sm:truncate"
            >
              {translate("admin.action.chaseNamed", { name: chase.name })}
            </Link>
          ) : (
            <Link
              to="/admin/events"
              search={{ community: chase.organizationId, report: "missing" }}
              className="min-w-0 hover:underline sm:truncate"
            >
              {translate("admin.action.chaseNamed", { name: chase.name })}
            </Link>
          )}
        </ItemTitle>
        <ItemDescription>{details.join(" · ")}</ItemDescription>
      </ItemContent>
      {chase.slug && (
        <ItemActions>
          <CopyReportLink
            slug={chase.slug}
            testId={`admin-needs-action-copy-${chase.organizationId}`}
          />
        </ItemActions>
      )}
    </Item>
  );
}

export function NeedsActionRow({ item }: { item: NeedsActionItem }) {
  if (item.kind === "reportsMissing") return <ReportChaseRow chase={item.chase} />;
  return <NeedsActionLinkRow item={item} />;
}

function NeedsActionLinkRow({
  item,
}: {
  item: Exclude<NeedsActionItem, { kind: "reportsMissing" }>;
}) {
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
      case "stakingMany":
        return {
          title: translate("admin.action.stakingCount", { count: item.count }),
          description: translate("admin.action.stakingHint"),
          link: <Link to="/admin/nodes" />,
        };
      case "reportsMissingMany":
        return {
          title: translate("admin.action.reportsMissingMany", { count: item.count }),
          description: translate("admin.action.reportsMissingManyHint"),
          link: <Link to="/admin/reports" search={{ month: item.month, show: "missing" }} />,
        };
      case "reportsOverdue":
        return {
          title: translate("admin.action.reportsOverdue", { count: item.count }),
          description: translate("admin.action.reportsOverdueHint"),
          link: <Link to="/admin/events" search={{ report: "missing" }} />,
        };
      case "quietMany":
        return {
          title: translate("admin.action.quietCount", { count: item.count }),
          description: translate("admin.action.quietHint"),
          link: <Link to="/admin/events" />,
        };
      case "quiet":
        return {
          title: translate("admin.action.quietNamed", { name: item.name }),
          description: translate("admin.action.quietHint"),
          link: <Link to="/admin/nodes/$nodeId" params={{ nodeId: item.nodeId }} search={{}} />,
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
