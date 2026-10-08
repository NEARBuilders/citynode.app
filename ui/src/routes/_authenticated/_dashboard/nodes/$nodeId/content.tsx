import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { PageContainer } from "@/components";
import { BulletinEditor } from "@/components/discovery/bulletin-editor";
import { EventOnboardingPanel } from "@/components/discovery/event-onboarding";
import { EventsEditor } from "@/components/discovery/events-editor";
import { resolveAppLocale, translateAppMessage } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import { CommunityHeader, ensureCommunityHeaderData } from "../../dashboard/node/-community-header";

type ContentTab = "events" | "onboarding" | "bulletin";

const TABS: readonly ContentTab[] = ["events", "onboarding", "bulletin"];

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId/content")({
  validateSearch: (search: Record<string, unknown>): { tab?: ContentTab } =>
    TABS.includes(search.tab as ContentTab) ? { tab: search.tab as ContentTab } : {},
  loader: ({ context, params }) => ensureCommunityHeaderData(context, params.nodeId),
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
  const api = useApiClient();
  const tenantId = useQuery(nodeByIdQueryOptions(api, nodeId)).data?.tenantId;

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
        <EventsEditor
          nodeId={nodeId}
          profileLink={
            tenantId ? (
              <Link to="/tenant/$tenantId" params={{ tenantId }} search={{ nodeId }} />
            ) : undefined
          }
        />
      )}
    </PageContainer>
  );
}
