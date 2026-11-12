import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ReportStatusBadge } from "@/components/discovery/report-status-badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";

export function RecentUpcomingEvents({
  testId,
  recent,
  upcoming,
}: {
  testId: string;
  recent: ReactNode[];
  upcoming: ReactNode[];
}) {
  const translate = useAppTranslation();
  const columns = [
    {
      key: "recent",
      title: translate("admin.home.recentEvents"),
      empty: translate("admin.events.noPast"),
      rows: recent,
    },
    {
      key: "upcoming",
      title: translate("admin.events.upcoming"),
      empty: translate("admin.events.noUpcoming"),
      rows: upcoming,
    },
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {columns.map((column) => (
        <div
          key={column.key}
          className="flex min-w-0 flex-col gap-3"
          data-testid={`${testId}-${column.key}`}
        >
          <h3 className="text-sm font-medium text-muted-foreground">{column.title}</h3>
          {column.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{column.empty}</p>
          ) : (
            <ItemGroup>{column.rows}</ItemGroup>
          )}
        </div>
      ))}
    </div>
  );
}

export function OverviewEventRow({
  testId,
  title,
  description,
  report,
}: {
  testId: string;
  title: ReactNode;
  description: ReactNode;
  report?: {
    nodeId: string;
    event: { id: string; startsAt: string | null; endsAt: string | null };
    submittedAt: string | null | undefined;
    reviewedAt?: string | null;
    now: number;
  };
}) {
  return (
    <Item variant="outline" size="sm" data-testid={testId}>
      <ItemContent className="min-w-0">
        <ItemTitle className="max-w-full">{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      {report && (
        <ItemActions>
          <Link
            to="/nodes/$nodeId/events/$activityId/report"
            params={{ nodeId: report.nodeId, activityId: report.event.id }}
          >
            <ReportStatusBadge
              activity={report.event}
              submittedAt={report.submittedAt}
              reviewedAt={report.reviewedAt}
              now={report.now}
            />
          </Link>
        </ItemActions>
      )}
    </Item>
  );
}
