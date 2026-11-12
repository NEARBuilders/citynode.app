import { Link } from "@tanstack/react-router";
import {
  hasReportsToShow,
  ReportChecklist,
  useReportChecklist,
} from "@/components/discovery/report-checklist";
import { SectionHeader } from "@/components/layout/section-header";
import { Button } from "@/components/ui/button";
import { Item, ItemActions, ItemContent, ItemTitle } from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";

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
  const reports = useReportChecklist(nodeId, primary);
  const { lists } = reports;
  if (!reports.failed && reports.pending) return null;
  if (
    !reports.failed &&
    !hasReportsToShow(lists.monthlyStatuses, lists.activities, lists.eventStatuses, now)
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
      {reports.failed ? (
        <Item variant="outline" data-testid="dashboard-node.reports-error">
          <ItemContent className="min-w-0">
            <ItemTitle>{translate("reports.loadError")}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Button size="sm" variant="outline" onClick={reports.retry}>
              {translate("common.retry")}
            </Button>
          </ItemActions>
        </Item>
      ) : (
        <ReportChecklist
          nodeId={nodeId}
          now={now}
          testId="dashboard-node.reports-list"
          {...lists}
        />
      )}
    </section>
  );
}
