import { Link } from "@tanstack/react-router";
import { SectionHeader } from "@/components/layout/section-header";
import { LocalDate } from "@/components/local-date";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { useAppTranslation } from "@/i18n/runtime";
import { eventsMissingReports } from "@/lib/event-reports";
import type { VisibilityActivity } from "@/lib/event-visibility";

export function EventsToReport({
  canReport,
  ready,
  nodeId,
  now,
  activities,
  statuses,
}: {
  canReport: boolean;
  ready: boolean;
  nodeId: string;
  now: number;
  activities: readonly (VisibilityActivity & { id: string; title: string; venue: string })[];
  statuses: readonly { activityId: string; submittedAt: string }[];
}) {
  const translate = useAppTranslation();
  if (!canReport || !ready) return null;
  const events = eventsMissingReports(activities, statuses, now);
  if (events.length === 0) return null;
  return (
    <section className="flex flex-col gap-6" data-testid="dashboard-node.events-to-report">
      <SectionHeader
        title={translate("dashboard.eventsToReport")}
        description={translate("dashboard.eventsToReportHint")}
      />
      <ItemGroup>
        {events.map((event) => (
          <Item key={event.id} variant="outline">
            <ItemContent className="min-w-0">
              <ItemTitle>
                <Link
                  to="/nodes/$nodeId/events/$activityId/report"
                  params={{ nodeId, activityId: event.id }}
                  className="hover:underline"
                  data-testid={`dashboard-node.report-${event.id}`}
                >
                  {event.title}
                </Link>
              </ItemTitle>
              <ItemDescription>
                {event.endsAt ? <LocalDate value={event.endsAt} format="datetime" /> : null}
                {event.venue ? ` · ${event.venue}` : ""}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    to="/nodes/$nodeId/events/$activityId/report"
                    params={{ nodeId, activityId: event.id }}
                  />
                }
              >
                {translate("events.submitReport")}
              </Button>
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}
