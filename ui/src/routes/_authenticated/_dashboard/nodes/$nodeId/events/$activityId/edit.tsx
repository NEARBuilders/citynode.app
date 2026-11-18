import { CalendarDotsIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import {
  type Activity,
  ActivityForm,
  ActivityFormPage,
  activitiesQueryOptions,
} from "@/components/discovery/activity-form";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { requireEventOrganizer } from "../../../-require-event-organizer";

export const Route = createFileRoute(
  "/_authenticated/_dashboard/nodes/$nodeId/events/$activityId/edit",
)({
  beforeLoad: ({ context, params }) => {
    requireEventOrganizer({ context, params });
  },
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.editEvent",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: EditActivity,
});

function EditActivity() {
  const translate = useAppTranslation();
  const { nodeId, activityId } = Route.useParams();
  const api = useApiClient();
  const list = useQuery(activitiesQueryOptions(api, nodeId));
  const activity = list.data?.find(
    (item): item is Activity => item.id === activityId && item.ownerNodeId !== null,
  );

  if (list.isPending) {
    return (
      <ActivityFormPage
        nodeId={nodeId}
        title={<Skeleton className="h-10 w-full max-w-64" />}
        headerTestId="activity-form.heading"
      >
        <div className="flex flex-col gap-6" aria-busy="true">
          {["a", "b", "c", "d"].map((key) => (
            <Skeleton key={key} className="h-11 w-full" />
          ))}
        </div>
      </ActivityFormPage>
    );
  }

  if (!activity) {
    return (
      <ActivityFormPage
        nodeId={nodeId}
        title={translate("events.edit")}
        headerTestId="activity-form.heading"
      >
        <EmptyState
          icon={CalendarDotsIcon}
          title={list.isError ? translate("events.loadEditError") : translate("events.notFound")}
          description={
            list.isError ? translate("events.connectionHint") : translate("events.removedHint")
          }
          action={
            list.isError ? (
              <Button variant="outline" onClick={() => list.refetch()}>
                {translate("common.retry")}
              </Button>
            ) : (
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    to="/nodes/$nodeId/content"
                    params={{ nodeId }}
                    search={{ tab: "events" }}
                  />
                }
              >
                {translate("events.back")}
              </Button>
            )
          }
        />
      </ActivityFormPage>
    );
  }

  const imported = activity.luma;
  const isEvent = activity.kind === "event";
  return (
    <ActivityFormPage
      nodeId={nodeId}
      title={isEvent ? translate("events.edit") : translate("events.editPost")}
      description={
        imported
          ? translate("events.lumaSynced")
          : isEvent
            ? translate("events.formDescription")
            : translate("events.postDescription")
      }
      headerTestId="activity-form.heading"
    >
      <ActivityForm key={activity.id} nodeId={nodeId} initial={activity} imported={imported} />
    </ActivityFormPage>
  );
}
