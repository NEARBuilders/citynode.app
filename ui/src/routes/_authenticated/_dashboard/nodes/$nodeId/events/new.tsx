import { createFileRoute } from "@tanstack/react-router";
import {
  ActivityForm,
  ActivityFormPage,
  blankActivity,
} from "@/components/discovery/activity-form";
import { resolveAppLocale, translateAppMessage, useAppTranslation } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";

type NewActivitySearch = { kind?: "social" };

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId/events/new")({
  validateSearch: (search: Record<string, unknown>): NewActivitySearch =>
    search.kind === "social" ? { kind: "social" } : {},
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          match.search.kind === "social"
            ? translateAppMessage(
                "meta.newPost",
                undefined,
                resolveAppLocale(undefined, match.context.locale),
              )
            : translateAppMessage(
                "nav.newEvent",
                undefined,
                resolveAppLocale(undefined, match.context.locale),
              ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: NewActivity,
});

function NewActivity() {
  const translate = useAppTranslation();
  const { nodeId } = Route.useParams();
  const { kind = "event" } = Route.useSearch();
  const isEvent = kind === "event";
  return (
    <ActivityFormPage
      nodeId={nodeId}
      title={isEvent ? translate("events.new") : translate("events.newPost")}
      description={
        isEvent ? translate("events.formDescription") : translate("events.postDescription")
      }
      headerTestId="activity-form.heading"
    >
      <ActivityForm key={kind} nodeId={nodeId} initial={blankActivity(nodeId, kind)} />
    </ActivityFormPage>
  );
}
