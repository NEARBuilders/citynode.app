import {
  ArrowSquareOutIcon,
  CalendarDotsIcon,
  CaretRightIcon,
  CheckCircleIcon,
  MapPinIcon,
  PencilIcon,
  TreeStructureIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Trans } from "everything-dev/ui/i18n";
import type { ReactElement } from "react";
import { getActiveRuntime, useApiClient, useAuthClient } from "@/app";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  InfoRow,
  NodeValidatorTable,
  PageHeader,
  SectionHeader,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components";
import { discoveryProfileQueryOptions } from "@/components/discovery/profile-editor";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import type { AppMessageId } from "@/i18n/catalogs";
import {
  resolveAppLocale,
  translateAppMessage,
  useAppLocale,
  useAppTranslation,
} from "@/i18n/runtime";
import { nodeKindLabel } from "@/lib/node-kind";
import { savedEndowmentOf } from "@/lib/node-staking-proposals";
import { pageTitle } from "@/lib/page-title";
import {
  adminNodeDetailQueryOptions,
  adminNodeListQueryOptions,
  communityEventStatsQueryOptions,
} from "@/lib/queries/nodes";
import {
  onboardingJoinsQueryOptions,
  recentUtcMonths,
  utcMonth,
} from "@/lib/queries/onboarding-joins";
import {
  formatNearBalance,
  resolveTeamAccountId,
  stakePoolAccountQueryOptions,
  toNetwork,
} from "@/lib/queries/stake-pool";
import { tenantByIdQueryOptions } from "@/lib/queries/tenants";
import { isPendingProposal, readRecentDaoProposals } from "@/lib/sputnik-proposals";
import { communityEventTotals } from "../-admin-progress";
import {
  BackLink,
  Disclosure,
  LoadError,
  RawJsonDisclosure,
  StatFigure,
  StatGrid,
} from "../-admin-ui";
import { CommunityJoinChart } from "../-community-join-chart";
import { CommunityEditor } from "./-community-editor";
import { NodeBindings } from "./-node-bindings";
import { NODE_DETAIL_TABS, type NodeDetailTab, parseNodeDetailSearch } from "./-node-management";
import { NodeStakingSequence } from "./-node-staking-sequence";
import { NodeValidators } from "./-node-validators";

type ApiClient = ReturnType<typeof useApiClient>;
type NodeSummary = Awaited<ReturnType<ApiClient["getNodeSummary"]>>;
type Node = NodeSummary["node"];
type Tenant = NonNullable<Awaited<ReturnType<ApiClient["resolveTenantById"]>>>;

const TAB_LABELS: Record<NodeDetailTab, AppMessageId> = {
  overview: "common.overview",
  validators: "common.validators",
  management: "admin.sequence.tab",
  domains: "admin.domain.title",
};

const TREND_MONTHS = 6;

export const Route = createFileRoute("/_admin/_dashboard/admin/nodes/$nodeId")({
  validateSearch: parseNodeDetailSearch,
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "meta.communityAdmin",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: AdminNodeDetail,
});

function AdminNodeDetail() {
  const translate = useAppTranslation();
  const { nodeId } = Route.useParams();
  const { tab, edit } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { runtimeConfig } = Route.useRouteContext();
  const apiClient = useApiClient();
  const nodeQuery = useQuery(adminNodeDetailQueryOptions(apiClient, nodeId));
  const tenantId = nodeQuery.data?.summary.node.tenantId ?? "";
  const tenantQuery = useQuery({
    ...tenantByIdQueryOptions(apiClient, tenantId),
    enabled: !!tenantId,
  });
  const activeTab = tab ?? "overview";
  const setEditing = (open: boolean) =>
    void navigate({ search: (previous) => ({ ...previous, edit: open ? true : undefined }) });

  if (nodeQuery.isLoading) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (nodeQuery.isError || !nodeQuery.data) {
    return (
      <EmptyState
        icon={TreeStructureIcon}
        title={translate("admin.community.loadError")}
        description={translate("admin.community.loadErrorHint")}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="outline" onClick={() => void nodeQuery.refetch()}>
              {translate("common.retry")}
            </Button>
            <Button variant="ghost" nativeButton={false} render={<Link to="/admin/nodes" />}>
              {translate("admin.community.back")}
            </Button>
          </div>
        }
      />
    );
  }

  const { summary, sourceNode, parent } = nodeQuery.data;
  const { node } = summary;
  const tenant = tenantQuery.data ?? null;

  return (
    <>
      <PageHeader
        label={<BackLink to="/admin/nodes">{translate("common.communities")}</BackLink>}
        title={node.name}
        description={
          parent ? (
            <Trans
              id="admin.nodeParentNamed"
              values={{ kind: nodeKindLabel(node.kind, undefined, translate), name: parent.name }}
              components={{
                parent: (
                  <Link
                    to="/admin/nodes/$nodeId"
                    params={{ nodeId: parent.id }}
                    search={{}}
                    className="text-foreground hover:underline"
                  ></Link>
                ),
              }}
            />
          ) : (
            nodeKindLabel(node.kind, translate("label.node"), translate)
          )
        }
        actions={
          <>
            <Button
              variant="outline"
              nativeButton={false}
              data-testid="admin-node-events"
              render={
                <Link
                  to="/nodes/$nodeId/content"
                  params={{ nodeId: node.id }}
                  search={{ tab: "events" }}
                />
              }
            >
              <CalendarDotsIcon />
              {translate("events.title")}
            </Button>
            <Button data-testid="admin-node-edit" onClick={() => setEditing(true)}>
              <PencilIcon />
              {translate("common.edit")}
            </Button>
          </>
        }
        headerTestId="admin-node.heading"
      />

      <CommunityProfileSummary node={node} onEdit={() => setEditing(true)} />

      <CommunityStats summary={summary} tenant={tenant} tenantQuery={tenantQuery} />

      <div className="flex flex-col gap-6">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const next = NODE_DETAIL_TABS.find((entry) => entry === value) ?? "overview";
              void navigate({
                search: (previous) => ({
                  ...previous,
                  tab: next === "overview" ? undefined : next,
                }),
              });
            }}
          >
            <TabsList variant="line">
              {NODE_DETAIL_TABS.map((value) => (
                <TabsTrigger key={value} value={value} data-testid={`admin-node-tab-${value}`}>
                  {translate(TAB_LABELS[value])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {activeTab === "overview" && (
          <NodeOverview summary={summary} tenant={tenant} sourceName={sourceNode?.name} />
        )}
        {activeTab === "validators" && (
          <NodeValidators key={node.id} nodeId={node.id} validators={summary.validators} />
        )}
        {activeTab === "management" && (
          <NodeStakingSequence
            key={`${node.id}:${savedEndowmentOf(node.metadata)}`}
            nodeId={node.id}
            tenantId={node.tenantId}
            savedEndowment={savedEndowmentOf(node.metadata)}
            validators={summary.validators}
          />
        )}
        {activeTab === "domains" &&
          (node.tenantId ? (
            <NodeBindings
              key={node.tenantId}
              tenantId={node.tenantId}
              gateway={getActiveRuntime(runtimeConfig)?.gatewayId ?? ""}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{translate("admin.community.noTenant")}</p>
          ))}
      </div>

      <CommunityEditor node={node} open={!!edit} onOpenChange={setEditing} />
    </>
  );
}

function CommunityProfileSummary({ node, onEdit }: { node: Node; onEdit: () => void }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const profileQuery = useQuery({
    ...discoveryProfileQueryOptions(apiClient, node.id),
    enabled: !!node.tenantId,
  });
  const profile = profileQuery.data;
  const place = [profile?.location, profile?.region].filter(Boolean).join(", ");

  return (
    <Card data-testid="admin-community-profile">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          {!node.tenantId ? (
            <p className="text-sm text-muted-foreground">
              {translate("admin.community.noProfile")}
            </p>
          ) : profileQuery.isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-5 w-96 max-w-full" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : profileQuery.isError ? (
            <LoadError
              message={translate("community.loadProfileError")}
              onRetry={() => void profileQuery.refetch()}
              testId="admin-community-profile-error"
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={profile?.published ? "success" : "outline"}>
                  {translate(
                    profile?.published
                      ? "admin.community.profilePublished"
                      : "admin.community.profileHidden",
                  )}
                </Badge>
                {place && (
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPinIcon className="size-4" />
                    {place}
                  </span>
                )}
              </div>
              <p
                className={
                  profile?.summary
                    ? "max-w-2xl text-base whitespace-pre-wrap text-foreground"
                    : "text-sm text-muted-foreground"
                }
                data-testid="admin-community-profile-summary"
              >
                {profile?.summary || translate("admin.community.noSummary")}
              </p>
              {!!profile?.channels.length && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1">
                  {profile.channels.map((channel) => (
                    <li key={`${channel.label}-${channel.url}`}>
                      <a
                        href={channel.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-foreground hover:underline"
                      >
                        {channel.label}
                        <ArrowSquareOutIcon className="size-3.5 text-muted-foreground" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={onEdit}
          data-testid="admin-community-profile-edit"
        >
          <PencilIcon />
          {translate("admin.community.editProfile")}
        </Button>
      </CardContent>
    </Card>
  );
}

function CommunityStats({
  summary,
  tenant,
  tenantQuery,
}: {
  summary: NodeSummary;
  tenant: Tenant | null;
  tenantQuery: { isError: boolean; isLoading: boolean; refetch: () => unknown };
}) {
  const translate = useAppTranslation();
  const { locale } = useAppLocale();
  const apiClient = useApiClient();
  const authClient = useAuthClient();
  const { node } = summary;
  const orgId = tenant?.orgId ?? "";
  const eventsQuery = useQuery(communityEventStatsQueryOptions(apiClient));
  const nodesQuery = useQuery(adminNodeListQueryOptions(apiClient, "all", "all"));
  const joinsQuery = useOrganizationJoins(orgId);
  const team = resolveTeamAccountId({
    tenantAccountId: tenant?.accountId,
    tenantOwnerKind: tenant?.ownerKind,
  });
  const pool =
    summary.stakingValidators.validators.find((validator) => validator.isDefault) ??
    summary.stakingValidators.validators[0];
  const stakeQuery = useQuery({
    ...stakePoolAccountQueryOptions({
      poolAccountId: pool?.accountId ?? "",
      stakerAccountId: team,
      authClient,
      network: toNetwork(pool?.network) ?? "mainnet",
    }),
    enabled: !!pool && !!team,
  });
  const events =
    eventsQuery.data && nodesQuery.data
      ? communityEventTotals(node.id, nodesQuery.data, eventsQuery.data)
      : undefined;
  const noSite = !node.tenantId;
  const retryTenant = tenantQuery.isError ? () => void tenantQuery.refetch() : undefined;

  return (
    <StatGrid>
      <StatFigure
        label={translate("admin.community.upcomingEvents")}
        value={events?.upcoming ?? "—"}
        hint={events ? translate("admin.community.pastEvents", { count: events.past }) : undefined}
        onRetry={
          eventsQuery.isError || nodesQuery.isError
            ? () => {
                if (eventsQuery.isError) void eventsQuery.refetch();
                if (nodesQuery.isError) void nodesQuery.refetch();
              }
            : undefined
        }
        testId="admin-node-stat-events"
      />
      <StatFigure
        label={translate("admin.newMembersThisMonthShort")}
        value={joinsQuery.data?.thisMonth.newMembers ?? "—"}
        hint={
          noSite
            ? translate("admin.community.noSite")
            : joinsQuery.data
              ? translate("admin.community.lastMonthCount", {
                  count: joinsQuery.data.lastMonth.newMembers,
                })
              : undefined
        }
        onRetry={retryTenant ?? (joinsQuery.isError ? () => void joinsQuery.refetch() : undefined)}
        testId="admin-node-stat-members"
      />
      <StatFigure
        label={translate("admin.redeemedThisMonthShort")}
        value={joinsQuery.data?.thisMonth.redeemed ?? "—"}
        hint={
          noSite
            ? translate("admin.community.noSite")
            : joinsQuery.data
              ? translate("admin.community.lastMonthCount", {
                  count: joinsQuery.data.lastMonth.redeemed,
                })
              : undefined
        }
        onRetry={retryTenant ?? (joinsQuery.isError ? () => void joinsQuery.refetch() : undefined)}
        testId="admin-node-stat-redeemed"
      />
      <StatFigure
        label={translate("admin.community.teamStake")}
        value={stakeQuery.data ? formatNearBalance(stakeQuery.data.stakedBalance, locale) : "—"}
        hint={
          !pool
            ? translate("admin.progress.stakingNone")
            : !team
              ? translate("admin.community.noTeamDao")
              : pool.accountId
        }
        tone={!pool ? "attention" : "default"}
        onRetry={stakeQuery.isError ? () => void stakeQuery.refetch() : undefined}
        testId="admin-node-stat-stake"
      />
    </StatGrid>
  );
}

function NodeOverview({
  summary,
  tenant,
  sourceName,
}: {
  summary: NodeSummary;
  tenant: Tenant | null;
  sourceName?: string;
}) {
  const translate = useAppTranslation();
  const { node } = summary;
  const resolvedElsewhere = summary.stakingValidators.sourceNodeId !== node.id;

  return (
    <div className="flex flex-col gap-12">
      <PendingItems summary={summary} tenant={tenant} />

      {tenant?.orgId && <CommunityTrend tenant={tenant} />}

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("common.staking")}
          description={
            resolvedElsewhere
              ? translate("admin.validatorSourceNamed", {
                  name: sourceName ?? summary.stakingValidators.sourceNodeId,
                })
              : translate("admin.community.stakingHint")
          }
        />
        {summary.stakingValidators.validators.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {translate("admin.community.noStakeValidators")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border">
            <NodeValidatorTable validators={summary.stakingValidators.validators} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-6">
        <SectionHeader title={translate("admin.community.children")} />
        {summary.children.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translate("admin.community.noChildren")}</p>
        ) : (
          <ItemGroup>
            {summary.children.map((child) => (
              <Item
                key={child.id}
                variant="outline"
                size="sm"
                render={
                  <Link to="/admin/nodes/$nodeId" params={{ nodeId: child.id }} search={{}} />
                }
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="max-w-full">
                    <span className="min-w-0 truncate">{child.name}</span>
                  </ItemTitle>
                  <ItemDescription>
                    {nodeKindLabel(child.kind, translate("label.node"), translate)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <CaretRightIcon className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <Disclosure
        label={translate("admin.proposal.showTechnical")}
        openLabel={translate("admin.proposal.hideTechnical")}
        testId="admin-node-technical"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col">
            <InfoRow label={translate("common.slug")} value={node.slug} mono />
            <InfoRow label={translate("admin.community.id")} value={node.id} mono />
            <InfoRow
              label={translate("admin.community.siteId")}
              value={node.tenantId ?? translate("common.none")}
              mono={!!node.tenantId}
            />
            <InfoRow
              label={translate("admin.community.parentId")}
              value={node.parentId ?? translate("common.none")}
              mono={!!node.parentId}
            />
          </div>
          <RawJsonDisclosure value={node.metadata} label={translate("admin.community.metadata")} />
        </div>
      </Disclosure>
    </div>
  );
}

function CommunityTrend({ tenant }: { tenant: Tenant }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const months = recentUtcMonths(TREND_MONTHS);
  const monthQueries = useQueries({
    queries: months.map((month) => onboardingJoinsQueryOptions(apiClient, month)),
  });
  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title={translate("admin.community.joinsTitle")} />
      {monthQueries.some((query) => query.isError) ? (
        <LoadError
          message={translate("admin.redemptions.failed")}
          onRetry={() => {
            for (const query of monthQueries) if (query.isError) void query.refetch();
          }}
        />
      ) : monthQueries.every((query) => query.isSuccess) ? (
        <CommunityJoinChart
          tenants={[tenant]}
          months={months.map((month, index) => ({ month, joins: monthQueries[index]?.data }))}
        />
      ) : (
        <Skeleton className="h-56 w-full" />
      )}
    </section>
  );
}

function PendingItems({ summary, tenant }: { summary: NodeSummary; tenant: Tenant | null }) {
  const translate = useAppTranslation();
  const { node } = summary;
  const team = resolveTeamAccountId({
    tenantAccountId: tenant?.accountId,
    tenantOwnerKind: tenant?.ownerKind,
  });
  const proposalsQuery = useQuery({
    queryKey: ["admin", "community-dao-proposals", team],
    queryFn: () => readRecentDaoProposals(team, 25),
    enabled: !!team,
    staleTime: 60_000,
    retry: false,
  });
  const openProposals = proposalsQuery.data?.filter(isPendingProposal) ?? [];
  const items: { key: string; title: string; description: string; link: ReactElement }[] = [];
  if (summary.stakingValidators.validators.length === 0) {
    items.push({
      key: "validator",
      title: translate("admin.action.stakingNamed", { name: node.name }),
      description: translate("admin.action.stakingHint"),
      link: (
        <Link
          to="/admin/nodes/$nodeId"
          params={{ nodeId: node.id }}
          search={{ tab: "validators" }}
        />
      ),
    });
  }
  if (openProposals.length > 0) {
    items.push({
      key: "dao",
      title: translate("admin.community.openDaoProposals", { count: openProposals.length }),
      description: translate("admin.community.openDaoProposalsHint", { account: team }),
      link: (
        <Link
          to="/admin/nodes/$nodeId"
          params={{ nodeId: node.id }}
          search={{ tab: "management" }}
        />
      ),
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <SectionHeader title={translate("admin.action.title")} sectionTestId="admin-node-pending" />
      {proposalsQuery.isError && (
        <LoadError
          message={translate("admin.community.daoProposalsFailed")}
          onRetry={() => void proposalsQuery.refetch()}
        />
      )}
      {proposalsQuery.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        proposalsQuery.isError ? null : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircleIcon className="size-4" />
            {translate("admin.action.empty")}
          </p>
        )
      ) : (
        <ItemGroup>
          {items.map((item) => (
            <Item key={item.key} variant="outline" size="sm" render={item.link}>
              <ItemMedia variant="icon">
                <WarningCircleIcon className="text-brand-strong" />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>{item.title}</ItemTitle>
                <ItemDescription>{item.description}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <CaretRightIcon className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      )}
    </section>
  );
}

function useOrganizationJoins(orgId: string) {
  const apiClient = useApiClient();
  const [thisMonth, lastMonth] = useQueries({
    queries: [utcMonth(0), utcMonth(-1)].map((month) => ({
      ...onboardingJoinsQueryOptions(apiClient, month),
      enabled: !!orgId,
    })),
  });
  const pick = (data: typeof thisMonth.data) => {
    const row = data?.organizations.find((entry) => entry.organizationId === orgId);
    return { redeemed: row?.redeemed ?? 0, newMembers: row?.newMembers ?? 0 };
  };
  return {
    data:
      thisMonth?.data && lastMonth?.data
        ? { thisMonth: pick(thisMonth.data), lastMonth: pick(lastMonth.data) }
        : undefined,
    isError: !!thisMonth?.isError || !!lastMonth?.isError,
    refetch: () => {
      if (thisMonth?.isError) void thisMonth.refetch();
      if (lastMonth?.isError) void lastMonth.refetch();
    },
  };
}
