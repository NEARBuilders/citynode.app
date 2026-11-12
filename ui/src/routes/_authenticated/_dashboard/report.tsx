import { BookOpenIcon, ClipboardTextIcon, ShieldIcon, UsersThreeIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { type ApiClient, useApiClient } from "@/app";
import { ReportChecklist, useReportChecklist } from "@/components/discovery/report-checklist";
import { EmptyState } from "@/components/empty-state";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { SectionHeader } from "@/components/layout/section-header";
import { useOpenSoleCommunity } from "@/components/layout/use-open-sole-community";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { useNow } from "@/hooks";
import { appErrorMessage } from "@/i18n/error-message";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { chooseReportCommunity, MONTHLY_REPORT_GUIDE } from "@/lib/monthly-reports";
import { pageTitle } from "@/lib/page-title";
import { reportCommunitiesQueryOptions } from "@/lib/queries/monthly-reports";

type ReportSearch = { community?: string };
type ReportCommunity = Awaited<
  ReturnType<ApiClient["listReportCommunities"]>
>["communities"][number];

export const Route = createFileRoute("/_authenticated/_dashboard/report")({
  validateSearch: (search: Record<string, unknown>): ReportSearch =>
    typeof search.community === "string" && search.community ? { community: search.community } : {},
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "reports.title",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: ReportPage,
});

function ReportPage() {
  const translate = useAppTranslation();
  const api = useApiClient();
  const { community: requested } = Route.useSearch();
  const { auth } = Route.useRouteContext();
  const listed = useQuery(reportCommunitiesQueryOptions(api));
  const chosen = listed.data ? chooseReportCommunity(listed.data.communities, requested) : null;
  const switching = !!chosen && chosen.organizationId !== auth.activeOrganizationId;
  const isPlatformAdmin = auth.user?.role === "admin";
  useOpenSoleCommunity(switching ? chosen.organizationId : null);

  const header = (
    <PageHeader
      title={translate("reports.title")}
      description={
        chosen
          ? translate("reports.descriptionNamed", { name: chosen.name })
          : listed.data?.communities.length
            ? translate("reports.description")
            : undefined
      }
      headerTestId="report.heading"
      actions={
        <>
          {isPlatformAdmin && (
            <Button
              size="sm"
              variant="outline"
              nativeButton={false}
              render={<Link to="/admin/reports" />}
              data-testid="report.admin-reports"
            >
              <ShieldIcon />
              {translate("reports.allCommunities")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/docs/$guide" params={{ guide: MONTHLY_REPORT_GUIDE }} />}
            data-testid="report.guide"
          >
            <BookOpenIcon />
            {translate("reports.guide")}
          </Button>
        </>
      }
    />
  );

  if (listed.isPending || switching) {
    return (
      <PageContainer>
        {header}
        <div className="flex flex-col gap-3" aria-busy="true" data-testid="report.loading">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      </PageContainer>
    );
  }

  if (listed.isError) {
    return (
      <PageContainer>
        {header}
        <EmptyState
          icon={ClipboardTextIcon}
          title={translate("reports.communitiesError")}
          description={appErrorMessage(listed.error, translate)}
          action={
            <Button
              variant="outline"
              onClick={() => void listed.refetch()}
              data-testid="report.retry"
            >
              {translate("common.retry")}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const { communities, memberships } = listed.data;
  if (communities.length === 0 && isPlatformAdmin) {
    return <Navigate to="/admin/reports" replace />;
  }
  if (communities.length === 0) {
    const member = memberships > 0;
    return (
      <PageContainer>
        {header}
        <EmptyState
          icon={ClipboardTextIcon}
          title={translate(member ? "reports.notOrganizer" : "reports.noCommunity")}
          description={translate(member ? "reports.notOrganizerHint" : "reports.noCommunityHint")}
          action={
            <Button
              nativeButton={false}
              render={<Link to={member ? "/dashboard/node" : "/explore"} />}
              data-testid="report.none-action"
            >
              {translate(member ? "reports.openCommunity" : "common.explore")}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  if (!chosen) {
    return (
      <PageContainer>
        {header}
        <section className="flex flex-col gap-6" data-testid="report.choose">
          <SectionHeader
            title={translate("dashboard.chooseCommunity")}
            description={translate("reports.chooseHint")}
          />
          <ItemGroup>
            {communities.map((community) => (
              <Item
                key={community.organizationId}
                variant="outline"
                render={<Link to="/report" search={{ community: community.slug }} />}
                data-testid={`report.community-${community.slug}`}
              >
                <ItemMedia variant="icon">
                  <UsersThreeIcon />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle>{community.name}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  <span className="text-sm text-muted-foreground">{translate("common.open")}</span>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </section>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}
      <ReportDesk community={chosen} several={communities.length > 1} />
    </PageContainer>
  );
}

function ReportDesk({ community, several }: { community: ReportCommunity; several: boolean }) {
  const translate = useAppTranslation();
  const now = useNow(60_000);
  const { nodeId } = community;
  const reports = useReportChecklist(nodeId);
  return (
    <section className="flex flex-col gap-6" data-testid="report.desk">
      {several && (
        <Button
          size="sm"
          variant="ghost"
          className="-ml-3 self-start"
          nativeButton={false}
          render={<Link to="/report" />}
          data-testid="report.switch"
        >
          {translate("reports.switchCommunity")}
        </Button>
      )}
      {reports.failed ? (
        <EmptyState
          icon={ClipboardTextIcon}
          title={translate("reports.loadError")}
          description={appErrorMessage(reports.error, translate)}
          action={
            <Button variant="outline" onClick={reports.retry} data-testid="report.desk-retry">
              {translate("common.retry")}
            </Button>
          }
        />
      ) : reports.pending ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : (
        <ReportChecklist
          nodeId={nodeId}
          now={now}
          testId="report.list"
          {...reports.lists}
          showAllReported
        />
      )}
    </section>
  );
}
