import {
  ArrowSquareOutIcon,
  CalendarDotsIcon,
  HourglassMediumIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buildTenantUrl, getActiveRuntime, useApiClient } from "@/app";
import { Bulletin, Button, LocalDate, NodeValidatorTable, SectionHeader } from "@/components";
import { AttendanceRecord } from "@/components/attendance-record";
import { CommunityMapStatus } from "@/components/discovery/community-map-status";
import { CommunityChannels, CommunityUpdates } from "@/components/discovery/community-updates";
import {
  EventDate,
  OpenEventStationButton,
  upcomingEvents,
} from "@/components/discovery/event-onboarding";
import {
  discoveryNodeQueryOptions,
  EventVisibilityBadge,
  ImportsWaiting,
  useVisibilityContext,
} from "@/components/discovery/event-visibility";
import { TeamStakeCard, useCanSeeTeamStake } from "@/components/team-stake-card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { eventVisibility, isWaitingImport } from "@/lib/event-visibility";
import { presentationLabel } from "@/lib/presentation-label";
import { onboardingRedemptionsQueryOptions } from "@/lib/queries/onboarding-joins";
import { resolveTeamAccountId, resolveTeamStakeTarget } from "@/lib/queries/stake-pool";
import {
  CONFIG_WRITE_PLAN,
  fetchDaoProposals,
  findPendingProposalForPlan,
} from "@/lib/sputnik-proposals";
import { PUBLISHED_CONFIG_SECTION_ID } from "../../tenant/-published-config-section";
import { MemberDirectory } from "./-member-directory";
import { OwnerActions } from "./-owner-actions";
import { ReturningMembers } from "./-returning-members";
import { TeamRequests } from "./-team-requests";

export const Route = createFileRoute("/_authenticated/_dashboard/dashboard/node/")({
  component: NodeOverview,
});

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

const REDEMPTION_STATS = [
  {
    label: "dashboard.redeemedThisMonth",
    month: "thisMonth",
    figure: "redeemed",
    testId: "dashboard-node.stat-redeemed-this-month",
  },
  {
    label: "dashboard.newMembersThisMonth",
    month: "thisMonth",
    figure: "newMembers",
    testId: "dashboard-node.stat-new-members-this-month",
  },
  {
    label: "dashboard.redeemedLastMonth",
    month: "lastMonth",
    figure: "redeemed",
    testId: "dashboard-node.stat-redeemed-last-month",
  },
  {
    label: "dashboard.newMembersLastMonth",
    month: "lastMonth",
    figure: "newMembers",
    testId: "dashboard-node.stat-new-members-last-month",
  },
] as const;

function NodeOverview() {
  const translate = useAppTranslation();
  const {
    runtimeConfig,
    nodes,
    selectedNode,
    summary,
    stakingSourceNode,
    tenant,
    auth,
    canManage,
    inFinanceTeam,
    canOrganize,
  } = Route.useRouteContext();
  const apiClient = useApiClient();
  const orgId = tenant?.orgId ?? auth.activeOrganizationId;
  const nodeId = selectedNode?.id ?? "";
  const daoQuery = useQuery({
    queryKey: ["org-dao", orgId],
    enabled: !!orgId && !!selectedNode && !!summary,
    staleTime: 60_000,
    queryFn: () =>
      apiClient.auth.getDao({ organizationId: orgId ?? "" }).catch(() => ({
        daoAccountId: null,
        daoNetwork: null,
      })),
  });
  const activities = useQuery({
    queryKey: ["discovery-activities", nodeId],
    queryFn: () => apiClient.listDiscoveryActivities({ nodeId }),
    enabled: !!nodeId,
    retry: false,
  });
  const listing = useQuery(discoveryNodeQueryOptions(apiClient, nodeId));
  const visibilityContext = useVisibilityContext(nodeId);
  const { now } = visibilityContext;
  const redemptions = useQuery({
    ...onboardingRedemptionsQueryOptions(apiClient, orgId ?? ""),
    enabled: !!canOrganize && !!orgId,
  });
  const daoOwned = !!tenant && tenant.ownerKind === "dao";
  const pendingConfigQuery = useQuery({
    queryKey: ["dashboard-node", "pending-config-proposal", tenant?.accountId],
    queryFn: async () => {
      const proposals = await fetchDaoProposals(tenant?.accountId ?? "");
      return findPendingProposalForPlan(proposals, CONFIG_WRITE_PLAN);
    },
    enabled: daoOwned && canManage && !!tenant?.accountId,
    refetchInterval: 15_000,
  });
  const teamStake = resolveTeamStakeTarget({
    daoAccountId: daoQuery.data?.daoAccountId,
    tenantAccountId: tenant?.accountId,
    tenantOwnerKind: tenant?.ownerKind,
    validators: summary?.stakingValidators.validators ?? [],
  });
  const showTeamStake = useCanSeeTeamStake(teamStake, { canManage, inFinanceTeam });
  if (!selectedNode || !summary) return null;

  const pendingConfig = pendingConfigQuery.data ?? null;

  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId;
  const stakingIsInherited = summary.stakingValidators.sourceNodeId !== selectedNode.id;
  const upcoming = upcomingEvents(activities.data ?? [], now);
  const liveCount =
    visibilityContext.communityPublic === null
      ? null
      : upcoming.filter((event) => eventVisibility(event, visibilityContext) === "live").length;
  const waitingCount = (activities.data ?? []).filter((event) =>
    isWaitingImport(event, now),
  ).length;

  const bulletin = selectedNode.metadata?.bulletin;
  const updates = listing.data?.updates ?? [];
  const channels = listing.data?.channels ?? [];
  const introLinks = [
    { hash: "coming-up", label: translate("dashboard.comingUp") },
    ...(updates.length > 0
      ? [{ hash: "updates", label: translate("explore.detail.updates") }]
      : []),
    ...(orgId ? [{ hash: "people", label: translate("members.title") }] : []),
  ];

  return (
    <div className="flex flex-col gap-12">
      <p className="text-sm text-muted-foreground" data-testid="dashboard-node.member-intro">
        {translate("dashboard.memberIntro")}{" "}
        {introLinks.map((link, index) => (
          <span key={link.hash}>
            {index > 0 && " · "}
            <Link
              to="/dashboard/node"
              search={{ nodeId: selectedNode.id }}
              hash={link.hash}
              className="font-medium text-foreground underline-offset-4 hover:underline"
              data-testid={`dashboard-node.member-intro-${link.hash}`}
            >
              {link.label}
            </Link>
          </span>
        ))}
      </p>
      <CommunityMapStatus
        nodeId={selectedNode.id}
        tenantStatus={tenant?.status}
        testId="dashboard-node.map-status"
        settingsLink={
          canManage && tenant ? (
            <Link
              to="/tenant/$tenantId"
              params={{ tenantId: tenant.id }}
              search={{ nodeId: selectedNode.id }}
            />
          ) : undefined
        }
      />
      {typeof bulletin === "string" && bulletin.trim() && <Bulletin content={bulletin} />}
      <div className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat
            label={translate("community.upcoming")}
            value={activities.isSuccess && liveCount !== null ? String(liveCount) : "—"}
            testId="dashboard-node.stat-events"
          />
          <Stat
            label={translate("common.validators")}
            value={String(summary.validators.length)}
            testId="dashboard-node.stat-validators"
          />
          <Stat
            label={translate("dashboard.subcommunities")}
            value={String(summary.children.length)}
            testId="dashboard-node.stat-children"
          />
          <Stat
            label={translate("common.staking")}
            value={
              summary.stakingValidators.validators.length === 0
                ? "—"
                : stakingIsInherited
                  ? translate("dashboard.stakingInherited")
                  : translate("dashboard.stakingOwn")
            }
            testId="dashboard-node.stat-staking"
          />
          {canOrganize &&
            !redemptions.isError &&
            REDEMPTION_STATS.map(({ label, month, figure, testId }) => (
              <Stat
                key={testId}
                label={translate(label)}
                value={redemptions.data ? String(redemptions.data[month][figure]) : "—"}
                testId={testId}
              />
            ))}
        </dl>
        {canOrganize && redemptions.isError && (
          <p
            className="text-sm text-muted-foreground"
            data-testid="dashboard-node.redemptions-error"
          >
            {translate("dashboard.redemptionsFailed")}
          </p>
        )}
        {canOrganize && orgId && (
          <ReturningMembers organizationId={orgId} nodeIds={nodes.map((node) => node.id)} />
        )}
      </div>

      {orgId && (
        <div id="people" className="scroll-mt-20">
          <MemberDirectory organizationId={orgId} nodeId={selectedNode.id} />
        </div>
      )}

      {orgId && (
        <AttendanceRecord
          organizationId={orgId}
          reconcile={!!canOrganize}
          testId="dashboard-node.attendance"
        />
      )}

      {orgId && (
        <div id="teams" className="scroll-mt-20">
          <TeamRequests organizationId={orgId} />
        </div>
      )}

      {canManage && (
        <OwnerActions
          nodeId={selectedNode.id}
          tenantId={tenant?.id ?? null}
          showPayouts={showTeamStake}
        />
      )}

      {daoOwned && canManage && pendingConfig && tenant && (
        <Item variant="outline" data-testid="dashboard-node.pending-config-proposal">
          <ItemMedia variant="icon">
            <HourglassMediumIcon />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle>
              {translate("lifecycle.awaitingProposal", { proposal: pendingConfig.id })}
            </ItemTitle>
            <ItemDescription>{translate("dashboard.configWaitingHint")}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  to="/tenant/$tenantId"
                  params={{ tenantId: tenant.id }}
                  search={{ nodeId: selectedNode.id }}
                  hash={PUBLISHED_CONFIG_SECTION_ID}
                />
              }
              data-testid="dashboard-node.pending-config-open"
            >
              {translate("common.review")}
            </Button>
          </ItemActions>
        </Item>
      )}

      <section id="coming-up" className="flex scroll-mt-20 flex-col gap-6">
        <SectionHeader
          title={translate("dashboard.comingUp")}
          action={
            canManage || canOrganize ? (
              <Button
                size="sm"
                nativeButton={false}
                render={
                  <Link to="/nodes/$nodeId/events/new" params={{ nodeId: selectedNode.id }} />
                }
                data-testid="dashboard-node.add-event"
              >
                <CalendarDotsIcon />
                {translate("events.add")}
              </Button>
            ) : undefined
          }
        />
        <ImportsWaiting
          count={waitingCount}
          testId="dashboard-node.imports-waiting"
          link={
            <Link
              to="/nodes/$nodeId/content"
              params={{ nodeId: selectedNode.id }}
              search={{ tab: "events", review: "imports" }}
            />
          }
        />
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {activities.isError
              ? translate("dashboard.eventsOwnerHint")
              : canManage || canOrganize
                ? translate("dashboard.noEventsHint")
                : translate("dashboard.noEventsMemberHint")}
          </p>
        ) : (
          <ItemGroup>
            {upcoming.slice(0, 3).map((event) => (
              <Item key={event.id} variant="outline">
                <ItemMedia>
                  <EventDate value={event.startsAt} />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle className="flex-wrap">
                    {event.title}
                    <EventVisibilityBadge activity={event} context={visibilityContext} />
                  </ItemTitle>
                  <ItemDescription>
                    {event.startsAt && <LocalDate value={event.startsAt} format="datetime" />}
                    {event.venue ? ` · ${event.venue}` : ""}
                  </ItemDescription>
                </ItemContent>
                {canOrganize && (
                  <ItemActions>
                    <OpenEventStationButton event={event} organizationId={orgId} />
                  </ItemActions>
                )}
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <CommunityUpdates
        updates={updates}
        nodeId={selectedNode.id}
        layout="page"
        id="updates"
        testId="dashboard-node.updates"
      />

      <CommunityChannels channels={channels} layout="page" testId="dashboard-node.channels" />

      {showTeamStake && (
        <div id="payouts" className="scroll-mt-20">
          <TeamStakeCard
            target={teamStake}
            pending={daoQuery.isLoading}
            teamLinked={
              !!resolveTeamAccountId({
                daoAccountId: daoQuery.data?.daoAccountId,
                tenantAccountId: tenant?.accountId,
                tenantOwnerKind: tenant?.ownerKind,
              })
            }
            validatorsTenantId={canManage ? tenant?.id : undefined}
            linkOrganizationId={canManage ? (orgId ?? undefined) : undefined}
          />
        </div>
      )}

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("common.validators")}
          description={
            stakingIsInherited
              ? translate("stake.sourceNamed", {
                  name: stakingSourceNode?.name ?? translate("dashboard.parentFallback"),
                })
              : translate("dashboard.stakeHintDirect")
          }
        />
        {summary.stakingValidators.validators.length === 0 && summary.validators.length === 0 ? (
          <p className="text-sm text-muted-foreground">{translate("tenant.noValidators")}</p>
        ) : (
          <NodeValidatorTable
            validators={
              summary.stakingValidators.validators.length > 0
                ? summary.stakingValidators.validators
                : summary.validators
            }
          />
        )}
      </section>

      {summary.children.length > 0 && (
        <section className="flex flex-col gap-6">
          <SectionHeader title={translate("dashboard.subcommunities")} />
          <ItemGroup>
            {summary.children.map((child) => {
              const childUrl = gateway ? buildTenantUrl(child.slug, gateway) : null;
              return (
                <Item key={child.id} variant="outline" size="sm">
                  <ItemMedia variant="icon">
                    <TreeStructureIcon />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle>{child.name}</ItemTitle>
                    <ItemDescription>
                      <span className="capitalize">
                        {presentationLabel(child.kind ?? "member", translate)}
                      </span>
                    </ItemDescription>
                  </ItemContent>
                  {childUrl && (
                    <ItemActions>
                      <Button
                        size="sm"
                        variant="ghost"
                        nativeButton={false}
                        render={(props) => (
                          <a {...props} href={childUrl} target="_blank" rel="noopener noreferrer" />
                        )}
                      >
                        {translate("dashboard.visit")}
                        <ArrowSquareOutIcon />
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              );
            })}
          </ItemGroup>
        </section>
      )}
    </div>
  );
}
