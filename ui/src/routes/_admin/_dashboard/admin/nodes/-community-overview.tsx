import { CaretRightIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext } from "react";
import { useApiClient } from "@/app";
import { Button, InfoRow, NodeValidatorTable, SectionHeader, Skeleton } from "@/components";
import { type DiscoveryActivity, EventDate } from "@/components/discovery/event-onboarding";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useNow } from "@/hooks/use-client";
import type { AppMessageId } from "@/i18n/catalogs";
import { useAppTranslation } from "@/i18n/runtime";
import { nodeKindLabel } from "@/lib/node-kind";
import { onboardingJoinsQueryOptions, utcMonth } from "@/lib/queries/onboarding-joins";
import { tenantByIdQueryOptions } from "@/lib/queries/tenants";
import { Disclosure, ListSkeleton, RawJsonDisclosure, StatFigure, StatGrid } from "../-admin-ui";
import {
  type AttentionItem,
  communityAttention,
  communityJoinsState,
  organizationJoinCounts,
  type ProgressState,
  progressState,
  type SplitEvents,
  splitCommunityEvents,
} from "./-community-progress";

type ApiClient = ReturnType<typeof useApiClient>;
type NodeSummary = Awaited<ReturnType<ApiClient["getNodeSummary"]>>;
type CommunityNode = NodeSummary["node"];

const UPCOMING_EVENTS_SHOWN = 3;

const ATTENTION_LABELS: Record<AttentionItem, AppMessageId> = {
  noSite: "admin.community.attentionNoSite",
  noOrganization: "admin.community.attentionNoOrganization",
  sitePending: "admin.community.attentionSitePending",
  siteSuspended: "admin.community.attentionSiteSuspended",
  noStaking: "admin.community.attentionNoStaking",
  noUpcomingEvents: "admin.community.noUpcomingEvents",
};

function useCommunityProgress(node: CommunityNode) {
  const apiClient = useApiClient();
  const now = useNow(60_000);
  const tenantId = node.tenantId ?? "";
  const eventsQuery = useQuery({
    queryKey: ["discovery-activities", node.id],
    queryFn: () => apiClient.listDiscoveryActivities({ nodeId: node.id }),
    enabled: !!tenantId,
    retry: false,
  });
  const tenantQuery = useQuery(tenantByIdQueryOptions(apiClient, tenantId));
  const hasSite = !!tenantId && tenantQuery.data !== null;
  const orgId = tenantQuery.data?.orgId ?? "";
  const currentJoins = useQuery({
    ...onboardingJoinsQueryOptions(apiClient, utcMonth(0)),
    enabled: !!orgId,
  });
  const previousJoins = useQuery({
    ...onboardingJoinsQueryOptions(apiClient, utcMonth(-1)),
    enabled: !!orgId,
  });
  const joinsQuery = {
    isPending: currentJoins.isPending || previousJoins.isPending,
    isError: currentJoins.isError || previousJoins.isError,
    data:
      currentJoins.data && previousJoins.data
        ? {
            thisMonth: organizationJoinCounts(currentJoins.data, orgId),
            lastMonth: organizationJoinCounts(previousJoins.data, orgId),
          }
        : undefined,
  };

  const events = progressState(hasSite ? eventsQuery : null, (activities) =>
    splitCommunityEvents(activities, now),
  );
  const joins = communityJoinsState({
    hasSite,
    tenant: tenantQuery,
    joins: joinsQuery,
  });

  return {
    events,
    joins,
    tenant: tenantQuery.data,
    hasSite,
    retryEvents: () => void eventsQuery.refetch(),
    retryJoins: () => {
      if (tenantQuery.isError) void tenantQuery.refetch();
      if (currentJoins.isError) void currentJoins.refetch();
      if (previousJoins.isError) void previousJoins.refetch();
    },
  };
}

type CommunityProgress = ReturnType<typeof useCommunityProgress>;

const CommunityProgressContext = createContext<CommunityProgress | null>(null);

export function CommunityProgressProvider({
  node,
  children,
}: {
  node: CommunityNode;
  children: ReactNode;
}) {
  const progress = useCommunityProgress(node);
  return (
    <CommunityProgressContext.Provider value={progress}>
      {children}
    </CommunityProgressContext.Provider>
  );
}

function useProgress() {
  const progress = useContext(CommunityProgressContext);
  if (!progress) throw new Error("CommunityProgressProvider is missing");
  return progress;
}

function ProgressStat<V>({
  label,
  state,
  render,
  unavailableHint,
  onRetry,
  testId,
}: {
  label: string;
  state: ProgressState<V>;
  render: (value: V) => { value: ReactNode; hint?: ReactNode };
  unavailableHint: string;
  onRetry: () => void;
  testId: string;
}) {
  const translate = useAppTranslation();
  if (state.status === "error") {
    return (
      <div className="flex min-w-0 flex-col gap-1" data-testid={testId}>
        <span className="text-sm text-muted-foreground">{label}</span>
        <span role="alert" className="text-sm text-destructive" data-testid={`${testId}-error`}>
          {translate("admin.community.statFailed")}
        </span>
        <Button variant="outline" size="sm" className="self-start" onClick={onRetry}>
          {translate("common.retry")}
        </Button>
      </div>
    );
  }
  if (state.status === "loading") {
    return <StatFigure label={label} value={<Skeleton className="h-10 w-16" />} testId={testId} />;
  }
  if (state.status === "unavailable") {
    return <StatFigure label={label} value="—" hint={unavailableHint} testId={testId} />;
  }
  const { value, hint } = render(state.value);
  return <StatFigure label={label} value={value} hint={hint} testId={testId} />;
}

export function CommunityStats({
  summary,
  sourceName,
}: {
  summary: NodeSummary;
  sourceName?: string;
}) {
  const translate = useAppTranslation();
  const { node } = summary;
  const progress = useProgress();
  const noJoinsHint = progress.hasSite
    ? translate("admin.community.noOrganization")
    : translate("admin.community.noSite");
  const stakingCount = summary.stakingValidators.validators.length;
  const stakingInherited = summary.stakingValidators.sourceNodeId !== node.id;

  return (
    <StatGrid>
      <ProgressStat
        label={translate("admin.community.upcomingEvents")}
        state={progress.events}
        render={({ upcoming, past }) => ({
          value: upcoming.length,
          hint: translate("admin.community.pastEvents", { count: past.length }),
        })}
        unavailableHint={translate("admin.community.noSite")}
        onRetry={progress.retryEvents}
        testId="admin-node.stat-events"
      />
      <ProgressStat
        label={translate("dashboard.redeemedThisMonth")}
        state={progress.joins}
        render={({ thisMonth, lastMonth }) => ({
          value: thisMonth.redeemed,
          hint: translate("admin.community.lastMonth", { count: lastMonth.redeemed }),
        })}
        unavailableHint={noJoinsHint}
        onRetry={progress.retryJoins}
        testId="admin-node.stat-redeemed"
      />
      <ProgressStat
        label={translate("dashboard.newMembersThisMonth")}
        state={progress.joins}
        render={({ thisMonth, lastMonth }) => ({
          value: thisMonth.newMembers,
          hint: translate("admin.community.lastMonth", { count: lastMonth.newMembers }),
        })}
        unavailableHint={noJoinsHint}
        onRetry={progress.retryJoins}
        testId="admin-node.stat-new-members"
      />
      <StatFigure
        label={translate("admin.community.stakingValidators")}
        value={stakingCount}
        hint={
          stakingCount === 0
            ? translate("admin.community.stakingNone")
            : stakingInherited
              ? translate("admin.community.stakingFrom", {
                  name: sourceName ?? summary.stakingValidators.sourceNodeId,
                })
              : translate("admin.community.stakingOwn")
        }
        tone={stakingCount === 0 ? "attention" : "default"}
        testId="admin-node.stat-staking"
      />
    </StatGrid>
  );
}

export function CommunityOverview({
  summary,
  sourceName,
}: {
  summary: NodeSummary;
  sourceName?: string;
}) {
  const translate = useAppTranslation();
  const { node } = summary;
  const progress = useProgress();
  const attention = communityAttention({
    hasSite: progress.hasSite,
    tenant: progress.tenant,
    stakingValidators: summary.stakingValidators.validators.length,
    upcomingEvents:
      progress.events.status === "ready" ? progress.events.value.upcoming.length : undefined,
  });
  const resolvedElsewhere = summary.stakingValidators.sourceNodeId !== node.id;
  const description =
    typeof node.metadata.description === "string" ? node.metadata.description : null;

  return (
    <div className="flex flex-col gap-12">
      {attention.length > 0 && (
        <section className="flex flex-col gap-6">
          <SectionHeader
            title={translate("admin.community.attention")}
            sectionTestId="admin-node.section.attention"
          />
          <ItemGroup>
            {attention.map((item) => (
              <Item
                key={item}
                variant="outline"
                size="sm"
                data-testid={`admin-node-attention-${item}`}
              >
                <ItemMedia>
                  <WarningCircleIcon className="size-5 text-brand-strong" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{translate(ATTENTION_LABELS[item])}</ItemTitle>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </section>
      )}

      <section className="flex flex-col gap-6">
        <SectionHeader
          title={translate("admin.community.upcomingEvents")}
          sectionTestId="admin-node.section.events"
        />
        <UpcomingEvents
          state={progress.events}
          onRetry={progress.retryEvents}
          hasSite={progress.hasSite}
        />
      </section>

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
        <SectionHeader
          title={translate("admin.community.children")}
          sectionTestId="admin-node.section.children"
        />
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
                    {nodeKindLabel(child.kind, translate("label.node"), translate)} ·{" "}
                    <span className="font-mono break-all">{child.slug}</span>
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

      <section className="flex flex-col gap-6">
        <SectionHeader title={translate("common.details")} />
        {description && <p className="max-w-2xl text-base text-foreground">{description}</p>}
        <TechnicalDetails node={node} />
      </section>
    </div>
  );
}

function UpcomingEvents({
  state,
  onRetry,
  hasSite,
}: {
  state: ProgressState<SplitEvents<DiscoveryActivity>>;
  onRetry: () => void;
  hasSite: boolean;
}) {
  const translate = useAppTranslation();
  if (!hasSite || state.status === "unavailable") {
    return <p className="text-sm text-muted-foreground">{translate("admin.community.noSite")}</p>;
  }
  if (state.status === "loading") return <ListSkeleton rows={2} />;
  if (state.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p role="alert" className="text-sm text-destructive" data-testid="admin-node-events-error">
          {translate("admin.community.eventsFailed")}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          {translate("common.retry")}
        </Button>
      </div>
    );
  }
  const { upcoming } = state.value;
  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {translate("admin.community.noUpcomingEvents")}
      </p>
    );
  }
  return (
    <ItemGroup data-testid="admin-node-upcoming-events">
      {upcoming.slice(0, UPCOMING_EVENTS_SHOWN).map((event) => (
        <Item key={event.id} variant="outline" size="sm">
          <ItemMedia>
            <EventDate value={event.startsAt} timeZone={event.timezone} />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="max-w-full">
              <span className="min-w-0 truncate">{event.title}</span>
            </ItemTitle>
            {event.venue && <ItemDescription>{event.venue}</ItemDescription>}
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

function TechnicalDetails({ node }: { node: CommunityNode }) {
  const translate = useAppTranslation();
  return (
    <Disclosure
      label={translate("admin.community.technicalDetails")}
      testId="admin-node-technical-details"
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col">
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
  );
}
