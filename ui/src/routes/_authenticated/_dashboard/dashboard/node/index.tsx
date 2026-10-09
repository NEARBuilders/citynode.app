import {
  ArrowSquareOutIcon,
  CalendarDotsIcon,
  HourglassMediumIcon,
  QrCodeIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { buildTenantUrl, getActiveRuntime, useApiClient } from "@/app";
import {
  Bulletin,
  Button,
  LocalDate,
  NodeValidatorTable,
  SectionHeader,
  TeamStakeCard,
} from "@/components";
import { EventDate, upcomingEvents } from "@/components/discovery/event-onboarding";
import {
  EventVisibilityBadge,
  ImportsWaiting,
  useVisibilityContext,
} from "@/components/discovery/event-visibility";
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
import { organizationsQueryOptions } from "@/lib/queries/organizations";
import { resolveTeamStakeTarget } from "@/lib/queries/stake-pool";
import {
  CONFIG_WRITE_PLAN,
  fetchDaoProposals,
  findPendingProposalForPlan,
} from "@/lib/sputnik-proposals";

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

function NodeOverview() {
  const translate = useAppTranslation();
  const { runtimeConfig, selectedNode, summary, stakingSourceNode, tenant, auth, canManage } =
    Route.useRouteContext();
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
  const visibilityContext = useVisibilityContext(nodeId);
  const { now } = visibilityContext;
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
  const orgsQuery = useQuery({
    ...organizationsQueryOptions(apiClient),
    enabled: daoOwned && canManage && !!orgId,
    staleTime: 30_000,
  });
  if (!selectedNode || !summary) return null;

  const pendingConfig = pendingConfigQuery.data ?? null;
  const orgSlug = orgsQuery.data?.find((org) => org.id === orgId)?.slug ?? null;

  const gateway = getActiveRuntime(runtimeConfig)?.gatewayId;
  const stakingIsInherited = summary.stakingValidators.sourceNodeId !== selectedNode.id;
  const teamStake = resolveTeamStakeTarget({
    daoAccountId: daoQuery.data?.daoAccountId,
    tenantAccountId: tenant?.accountId,
    tenantOwnerKind: tenant?.ownerKind,
    validators: summary.stakingValidators.validators,
  });
  const upcoming = upcomingEvents(activities.data ?? [], now);
  const liveCount =
    visibilityContext.communityPublic === null
      ? null
      : upcoming.filter((event) => eventVisibility(event, visibilityContext) === "live").length;
  const waitingCount = (activities.data ?? []).filter((event) =>
    isWaitingImport(event, now),
  ).length;
  const onboardingLink = (
    <Link
      to="/nodes/$nodeId/content"
      params={{ nodeId: selectedNode.id }}
      search={{ tab: "onboarding" }}
    />
  );

  const bulletin = selectedNode.metadata?.bulletin;

  return (
    <div className="flex flex-col gap-12">
      {typeof bulletin === "string" && bulletin.trim() && (
        <Bulletin content={bulletin} runtimeConfig={runtimeConfig} />
      )}
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
      </dl>

      {daoOwned && canManage && pendingConfig && orgSlug && (
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
                <Link to="/orgs/$slug" params={{ slug: orgSlug }} search={{ tab: "node-config" }} />
              }
              data-testid="dashboard-node.pending-config-open"
            >
              {translate("common.review")}
            </Button>
          </ItemActions>
        </Item>
      )}

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("dashboard.comingUp")}
          action={
            <Button
              size="sm"
              nativeButton={false}
              render={<Link to="/nodes/$nodeId/events/new" params={{ nodeId: selectedNode.id }} />}
              data-testid="dashboard-node.add-event"
            >
              <CalendarDotsIcon />
              {translate("events.add")}
            </Button>
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
              : translate("dashboard.noEventsHint")}
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
                <ItemActions>
                  <Button
                    size="sm"
                    variant="outline"
                    nativeButton={false}
                    render={onboardingLink}
                    aria-label={translate("station.onboardingNamed", { event: event.title ?? "" })}
                  >
                    <QrCodeIcon />
                    <span className="hidden sm:inline">{translate("org.onboarding")}</span>
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <TeamStakeCard target={teamStake} pending={daoQuery.isLoading} />

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
