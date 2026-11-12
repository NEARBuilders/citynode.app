import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { activitiesQueryOptions } from "@/components/discovery/activity-form";
import { hasReportsToShow, ReportChecklist } from "@/components/discovery/report-checklist";
import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { eventReportStatusesQueryOptions } from "@/lib/queries/event-reports";
import { monthlyReportStatusesQueryOptions } from "@/lib/queries/monthly-reports";

export function CommunityReports({
  nodeId,
  primary,
  now,
}: {
  nodeId: string;
  primary: boolean;
  now: number;
}) {
  const translate = useAppTranslation();
  const apiClient = useApiClient();
  const activities = useQuery(activitiesQueryOptions(apiClient, nodeId));
  const eventStatuses = useQuery(eventReportStatusesQueryOptions(apiClient, nodeId));
  const monthlyStatuses = useQuery({
    ...monthlyReportStatusesQueryOptions(apiClient, nodeId),
    enabled: primary,
  });
  const failed = [activities, eventStatuses, ...(primary ? [monthlyStatuses] : [])].filter(
    (query) => query.isError,
  );
  const ready =
    activities.isSuccess && eventStatuses.isSuccess && (!primary || monthlyStatuses.isSuccess);
  const monthly = primary ? (monthlyStatuses.data ?? null) : null;
  if (failed.length === 0 && !ready) return null;
  if (
    failed.length === 0 &&
    !hasReportsToShow(monthly, activities.data ?? [], eventStatuses.data ?? [], now)
  ) {
    return null;
  }
  return (
    <section className="flex flex-col gap-6" data-testid="dashboard-node.reports">
      <SectionHeader
        title={translate("reports.title")}
        description={translate("reports.description")}
        action={
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/report" />}
            data-testid="dashboard-node.reports-open"
          >
            {translate("reports.openAll")}
          </Button>
        }
      />
      {failed.length > 0 ? (
        <Item variant="outline" data-testid="dashboard-node.reports-error">
          <ItemContent className="min-w-0">
            <ItemTitle>{translate("reports.loadError")}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                for (const query of failed) void query.refetch();
              }}
            >
              {translate("common.retry")}
            </Button>
          </ItemActions>
        </Item>
      ) : (
        <ReportChecklist
          nodeId={nodeId}
          now={now}
          testId="dashboard-node.reports-list"
          monthlyStatuses={monthly}
          activities={activities.data ?? []}
          eventStatuses={eventStatuses.data ?? []}
        />
      )}
    </section>
  );
}
