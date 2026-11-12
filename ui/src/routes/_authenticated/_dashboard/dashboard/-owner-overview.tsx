import { RocketLaunchIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { Button, LocalDate, SectionHeader } from "@/components";
import { activitiesQueryOptions } from "@/components/discovery/activity-form";
import { upcomingEvents } from "@/components/discovery/event-onboarding";
import {
  EventVisibilityBadge,
  useVisibilityContext,
} from "@/components/discovery/event-visibility";
import { ReportChecklist } from "@/components/discovery/report-checklist";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { useNow } from "@/hooks";
import { useAppTranslation } from "@/i18n/runtime";
import { eventEndsAt } from "@/lib/event-reports";
import { eventTitleLink, eventVisibility, type VisibilityContext } from "@/lib/event-visibility";
import { isReportableMonth, reportMonth } from "@/lib/monthly-reports";
import {
  eventCheckInCountQueryOptions,
  eventReportStatusesQueryOptions,
} from "@/lib/queries/event-reports";
import {
  monthlyReportQueryOptions,
  monthlyReportStatusesQueryOptions,
} from "@/lib/queries/monthly-reports";
import { onboardingRedemptionsQueryOptions } from "@/lib/queries/onboarding-joins";
import { teamJoinBoardQueryOptions } from "@/lib/queries/team-join-requests";
import {
  ListSkeleton,
  LoadError,
  StatFigure,
  StatGrid,
} from "@/routes/_admin/_dashboard/admin/-admin-ui";
import { type HomeInvitation, InvitationSteps } from "./-invitation-steps";
import type { NodeSetupStep } from "./-next-steps";
import { OverviewEventColumns, OverviewEventRow } from "./-overview-events";

export const OWNER_EVENTS_LIMIT = 3;

export interface OwnerCommunity {
  nodeId: string;
  organizationId: string;
  name: string;
}

export function OwnerOverview({
  community,
  invitations,
}: {
  community: OwnerCommunity;
  invitations: HomeInvitation[];
}) {
  return (
    <div className="flex flex-col gap-12" data-testid="home-owner.overview">
      <OwnerReports nodeId={community.nodeId} />
      <OwnerWaiting organizationId={community.organizationId} invitations={invitations} />
      <OwnerEvents community={community} />
      <OwnerOnboarding community={community} />
    </div>
  );
}

function OwnerReports({ nodeId }: { nodeId: string }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const now = useNow(60_000);
  const activities = useQuery(activitiesQueryOptions(apiClient, nodeId));
  const eventStatuses = useQuery(eventReportStatusesQueryOptions(apiClient, nodeId));
  const monthlyStatuses = useQuery(monthlyReportStatusesQueryOptions(apiClient, nodeId));
  const queries = [activities, eventStatuses, monthlyStatuses];
  const failed = queries.filter((query) => query.isError);

  return (
    <section className="flex flex-col gap-6" data-testid="home-owner.reports">
      <SectionHeader
        title={translate("reports.title")}
        description={translate("reports.description")}
        sectionTestId="home-owner.reports-heading"
        action={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to="/report" />}
            data-testid="home-owner.open-reports"
          >
            {translate("reports.openAll")}
          </Button>
        }
      />
      {failed.length > 0 ? (
        <LoadError
          message={translate("reports.loadError")}
          onRetry={() => {
            for (const query of failed) void query.refetch();
          }}
          testId="home-owner.reports-error"
        />
      ) : queries.some((query) => query.isPending) ? (
        <ListSkeleton rows={2} />
      ) : (
        <ReportChecklist
          nodeId={nodeId}
          now={now}
          testId="home-owner.reports-list"
          monthlyStatuses={monthlyStatuses.data ?? []}
          activities={activities.data ?? []}
          eventStatuses={eventStatuses.data ?? []}
          showAllReported
        />
      )}
    </section>
  );
}

function OwnerWaiting({
  organizationId,
  invitations,
}: {
  organizationId: string;
  invitations: HomeInvitation[];
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const board = useQuery(teamJoinBoardQueryOptions(apiClient, organizationId));
  const waiting = (board.data?.requests ?? []).filter(
    (request) => request.status === "pending" && request.canDecide,
  ).length;
  if (invitations.length === 0 && waiting === 0 && !board.isError) return null;

  return (
    <section className="flex flex-col gap-6" data-testid="home-owner.waiting">
      <SectionHeader
        title={translate("dashboard.ownerWaiting")}
        sectionTestId="home-owner.waiting-heading"
      />
      {invitations.length > 0 && <InvitationSteps invitations={invitations} />}
      {board.isError ? (
        <LoadError
          message={translate("teamRequests.loadFailed")}
          onRetry={() => void board.refetch()}
          testId="home-owner.team-requests-error"
        />
      ) : (
        waiting > 0 && (
          <ItemGroup>
            <Item variant="outline" data-testid="home-owner.team-requests">
              <ItemMedia variant="icon">
                <UsersThreeIcon />
              </ItemMedia>
              <ItemContent className="min-w-0">
                <ItemTitle>
                  {translate("dashboard.ownerTeamRequests", { count: waiting })}
                </ItemTitle>
                <ItemDescription>{translate("dashboard.ownerTeamRequestsHint")}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link to="/dashboard/node" hash="teams" />}
                  data-testid="home-owner.team-requests-open"
                >
                  {translate("common.review")}
                </Button>
              </ItemActions>
            </Item>
          </ItemGroup>
        )
      )}
    </section>
  );
}

type OwnerEvent = ReturnType<typeof upcomingEvents>[number];

function OwnerEvents({ community }: { community: OwnerCommunity }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const { nodeId, organizationId } = community;
  const context = useVisibilityContext(nodeId);
  const { now } = context;
  const activities = useQuery(activitiesQueryOptions(apiClient, nodeId));
  const eventStatuses = useQuery(eventReportStatusesQueryOptions(apiClient, nodeId));
  const failed = [activities, eventStatuses].filter((query) => query.isError);
  const reported = new Map((eventStatuses.data ?? []).map((status) => [status.activityId, status]));
  const all = activities.data ?? [];
  const recent = all
    .filter((event) => eventVisibility(event, { communityPublic: true, now }) === "ended")
    .sort((a, b) => eventEndsAt(b) - eventEndsAt(a))
    .slice(0, OWNER_EVENTS_LIMIT);
  const upcoming = upcomingEvents(all, now).slice(0, OWNER_EVENTS_LIMIT);
  const row = (event: OwnerEvent, past: boolean) => (
    <OverviewEventRow
      key={event.id}
      testId={`home-owner.event-${event.id}`}
      title={
        <>
          <OwnerEventTitle event={event} nodeId={nodeId} context={context} />
          {!past && <EventVisibilityBadge activity={event} context={context} />}
        </>
      }
      description={
        <>
          {event.startsAt && <LocalDate value={event.startsAt} format="datetime" />}
          {past && (
            <>
              {event.startsAt && " · "}
              <EventCheckIns
                organizationId={organizationId}
                eventId={event.id}
                testId={`home-owner.event-${event.id}-check-ins`}
              />
            </>
          )}
        </>
      }
      report={
        past
          ? {
              nodeId,
              event,
              submittedAt: reported.get(event.id)?.submittedAt ?? null,
              reviewedAt: reported.get(event.id)?.reviewedAt ?? null,
              now,
            }
          : undefined
      }
    />
  );

  return (
    <section className="flex flex-col gap-6" data-testid="home-owner.events">
      <SectionHeader
        title={translate("events.title")}
        description={translate("dashboard.ownerEventsDescription", { name: community.name })}
        sectionTestId="home-owner.events-heading"
        action={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link to="/nodes/$nodeId/content" params={{ nodeId }} search={{ tab: "events" }} />
            }
            data-testid="home-owner.all-events"
          >
            {translate("admin.home.allEvents")}
          </Button>
        }
      />
      {failed.length > 0 ? (
        <LoadError
          message={translate("admin.events.failed")}
          onRetry={() => {
            for (const query of failed) void query.refetch();
          }}
          testId="home-owner.events-error"
        />
      ) : activities.isPending || eventStatuses.isPending ? (
        <ListSkeleton rows={3} />
      ) : (
        <OverviewEventColumns
          testId="home-owner.events"
          columns={[
            {
              key: "recent",
              title: translate("admin.home.recentEvents"),
              empty: translate("admin.events.noPast"),
              rows: recent.map((event) => row(event, true)),
            },
            {
              key: "upcoming",
              title: translate("admin.events.upcoming"),
              empty: translate("admin.events.noUpcoming"),
              rows: upcoming.map((event) => row(event, false)),
            },
          ]}
        />
      )}
    </section>
  );
}

function OwnerEventTitle({
  event,
  nodeId,
  context,
}: {
  event: OwnerEvent;
  nodeId: string;
  context: VisibilityContext;
}) {
  const className = "min-w-0 truncate hover:underline";
  return eventTitleLink(eventVisibility(event, context), true) === "activity" ? (
    <Link to="/activity/$activityId" params={{ activityId: event.id }} className={className}>
      {event.title}
    </Link>
  ) : (
    <Link
      to="/nodes/$nodeId/events/$activityId/edit"
      params={{ nodeId, activityId: event.id }}
      className={className}
    >
      {event.title}
    </Link>
  );
}

function EventCheckIns({
  organizationId,
  eventId,
  testId,
}: {
  organizationId: string;
  eventId: string;
  testId: string;
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const count = useQuery(eventCheckInCountQueryOptions(apiClient, organizationId, eventId));
  if (count.isError) {
    return (
      <span
        role="alert"
        className="inline-flex flex-wrap items-center gap-1 text-destructive"
        data-testid={`${testId}-error`}
      >
        {translate("dashboard.eventCheckInsFailed")}
        <Button
          variant="link"
          size="xs"
          className="h-auto p-0"
          onClick={() => void count.refetch()}
        >
          {translate("common.retry")}
        </Button>
      </span>
    );
  }
  return (
    <span data-testid={testId}>
      {count.isSuccess ? translate("dashboard.eventCheckIns", { count: count.data }) : "…"}
    </span>
  );
}

function OwnerOnboarding({ community }: { community: OwnerCommunity }) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const now = useNow(60_000);
  const { nodeId, organizationId } = community;
  const current = reportMonth(now);
  const previous = reportMonth(now, -1);
  const redemptions = useQuery(onboardingRedemptionsQueryOptions(apiClient, organizationId));
  const currentReport = useQuery({
    ...monthlyReportQueryOptions(apiClient, nodeId, current),
    enabled: isReportableMonth(current),
  });
  const previousReport = useQuery({
    ...monthlyReportQueryOptions(apiClient, nodeId, previous),
    enabled: isReportableMonth(previous),
  });
  const lastMonth = (count: number | undefined) =>
    count === undefined ? undefined : translate("admin.community.lastMonthCount", { count });
  const retryRedemptions = redemptions.isError ? () => void redemptions.refetch() : undefined;
  const retryReport = currentReport.isError ? () => void currentReport.refetch() : undefined;
  const thisStats = currentReport.data?.stats;
  const lastStats = previousReport.data?.stats ?? undefined;

  return (
    <section className="flex flex-col gap-6" data-testid="home-owner.onboarding">
      <SectionHeader
        title={translate("admin.onboarding.title")}
        description={translate("dashboard.ownerOnboardingDescription", { name: community.name })}
        sectionTestId="home-owner.onboarding-heading"
      />
      <StatGrid>
        <StatFigure
          label={translate("dashboard.redeemedThisMonth")}
          value={redemptions.data?.thisMonth.redeemed ?? "—"}
          hint={lastMonth(redemptions.data?.lastMonth.redeemed)}
          onRetry={retryRedemptions}
          testId="home-owner.stat-joins"
        />
        <StatFigure
          label={translate("dashboard.newMembersThisMonth")}
          value={redemptions.data?.thisMonth.newMembers ?? "—"}
          hint={lastMonth(redemptions.data?.lastMonth.newMembers)}
          onRetry={retryRedemptions}
          testId="home-owner.stat-new-members"
        />
        {isReportableMonth(current) && (
          <>
            <StatFigure
              label={translate("dashboard.checkInsThisMonth")}
              value={thisStats?.checkIns ?? "—"}
              hint={lastMonth(lastStats?.checkIns)}
              onRetry={retryReport}
              testId="home-owner.stat-check-ins"
            />
            <StatFigure
              label={translate("dashboard.eventsHeldThisMonth")}
              value={thisStats?.eventsHeld ?? "—"}
              hint={lastMonth(lastStats?.eventsHeld)}
              onRetry={retryReport}
              testId="home-owner.stat-events-held"
            />
          </>
        )}
      </StatGrid>
    </section>
  );
}

export function OwnerSetupLine({
  steps,
  communityName,
}: {
  steps: NodeSetupStep[];
  communityName: string;
}) {
  const translate = useAppTranslation();
  return (
    <Item variant="outline" data-testid="home-owner.setup">
      <ItemMedia variant="icon">
        <RocketLaunchIcon />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{translate("setup.title", { name: communityName })}</ItemTitle>
        <ItemDescription>
          {translate("setup.progress", {
            done: steps.filter((step) => step.done).length,
            total: steps.length,
          })}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={<Link to="/dashboard/node" />}
          data-testid="home-owner.setup-open"
        >
          {translate("dashboard.setupContinue")}
        </Button>
      </ItemActions>
    </Item>
  );
}
