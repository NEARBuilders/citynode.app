import { createFileRoute } from "@tanstack/react-router";
import { PageContainer } from "@/components";
import { activitiesQueryOptions } from "@/components/discovery/activity-form";
import { BulletinEditor } from "@/components/discovery/bulletin-editor";
import { EventOnboardingPanel } from "@/components/discovery/event-onboarding";
import { EventsEditor } from "@/components/discovery/events-editor";
import { discoveryProfileQueryOptions } from "@/components/discovery/profile-editor";
import { resolveAppLocale, translateAppMessage } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { CommunityHeader, ensureCommunityHeaderData } from "../../dashboard/node/-community-header";

type ContentTab = "events" | "onboarding" | "bulletin";

const TABS: readonly ContentTab[] = ["events", "onboarding", "bulletin"];

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId/content")({
  validateSearch: (search: Record<string, unknown>): { tab?: ContentTab } =>
    TABS.includes(search.tab as ContentTab) ? { tab: search.tab as ContentTab } : {},
  loaderDeps: ({ search }) => ({ tab: search.tab ?? "events" }),
  loader: async ({ context, params, deps }) => {
    const { queryClient, apiClient } = context;
    await Promise.all([
      ensureCommunityHeaderData(context, params.nodeId),
      ...(deps.tab === "events"
        ? [
            queryClient.prefetchQuery(discoveryProfileQueryOptions(apiClient, params.nodeId)),
            queryClient.prefetchQuery(activitiesQueryOptions(apiClient, params.nodeId)),
          ]
        : []),
    ]);
  },
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "events.title",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: CommunityContent,
});

function CommunityContent() {
  const { nodeId } = Route.useParams();
  const { tab = "events" } = Route.useSearch();
  const { auth } = Route.useRouteContext();

  return (
    <PageContainer variant="wide">
      <CommunityHeader
        headerTestId="content.heading"
        nodeId={nodeId}
        active={tab === "onboarding" ? "onboarding" : tab === "bulletin" ? "bulletin" : "content"}
        replace
        testIds={{ onboarding: "content-tab-onboarding" }}
      />
      {tab === "onboarding" ? (
        <EventOnboardingPanel nodeId={nodeId} organizationId={auth.activeOrganizationId} />
      ) : tab === "bulletin" ? (
        <BulletinEditor nodeId={nodeId} />
      ) : (
        <EventsEditor nodeId={nodeId} />
      )}
    </PageContainer>
  );
}
