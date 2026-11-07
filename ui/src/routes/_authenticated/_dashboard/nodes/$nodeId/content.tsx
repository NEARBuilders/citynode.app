import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { PageContainer } from "@/components";
import { activitiesQueryOptions } from "@/components/discovery/activity-form";
import { BulletinEditor } from "@/components/discovery/bulletin-editor";
import { EventOnboardingPanel } from "@/components/discovery/event-onboarding";
import { EventsEditor } from "@/components/discovery/events-editor";
import { discoveryProfileQueryOptions } from "@/components/discovery/profile-editor";
import { resolveAppLocale, translateAppMessage } from "@/i18n/runtime";
import { isOnboardingOrganizer } from "@/lib/onboarding-codes";
import { pageTitle } from "@/lib/page-title";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import { tenantByIdQueryOptions } from "@/lib/queries/tenants";
import {
  CommunityHeader,
  communityAuthContextQueryOptions,
  ensureCommunityHeaderData,
} from "../../dashboard/node/-community-header";

type ContentTab = "events" | "onboarding" | "bulletin";
type ContentSearch = { tab?: ContentTab; review?: "imports" };

const TABS: readonly ContentTab[] = ["events", "onboarding", "bulletin"];
const ownersOnly = { to: "/dashboard", search: { restricted: "owners" } } as const;

function defaultContentTab(canOrganize: boolean, canOperate: boolean): ContentTab {
  if (canOrganize) return "events";
  if (canOperate) return "bulletin";
  return "events";
}

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId/content")({
  validateSearch: (search: Record<string, unknown>): ContentSearch => ({
    ...(TABS.includes(search.tab as ContentTab) ? { tab: search.tab as ContentTab } : {}),
    ...(search.review === "imports" ? { review: "imports" as const } : {}),
  }),
  beforeLoad: ({ context, params, search }) => {
    const canManage = context.canManageCommunity;
    const canOrganize = context.canOrganizeEvents ?? canManage;
    const canOperate = context.canOperateNodes ?? canManage;
    const tab = search.tab ?? defaultContentTab(canOrganize, canOperate);

    if ((tab === "events" || tab === "onboarding") && !canOrganize) {
      if (canOperate) {
        throw redirect({
          to: "/nodes/$nodeId/content",
          params,
          search: { tab: "bulletin" },
          replace: true,
        });
      }
      throw redirect(ownersOnly);
    }
    if (tab === "bulletin" && !canManage && !canOperate) {
      throw redirect(ownersOnly);
    }
    if (!search.tab && tab !== "events") {
      throw redirect({
        to: "/nodes/$nodeId/content",
        params,
        search: { tab },
        replace: true,
      });
    }
  },
  loaderDeps: ({ search }) => ({
    tab: search.tab ?? "events",
  }),
  loader: async ({ context, params, deps }) => {
    const { queryClient, apiClient } = context;
    await Promise.all([
      ensureCommunityHeaderData(context, params.nodeId),
      ...(deps.tab === "events"
        ? [
            queryClient.prefetchQuery(discoveryProfileQueryOptions(apiClient, params.nodeId)),
            queryClient.prefetchQuery(activitiesQueryOptions(apiClient, params.nodeId)),
            queryClient
              .ensureQueryData(nodeByIdQueryOptions(apiClient, params.nodeId))
              .then((node) =>
                node?.tenantId
                  ? queryClient.prefetchQuery(tenantByIdQueryOptions(apiClient, node.tenantId))
                  : undefined,
              )
              .catch(() => undefined),
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
  const { tab: searchTab, review } = Route.useSearch();
  const {
    auth,
    canManageCommunity,
    canOrganizeEvents: canOrganize = canManageCommunity,
    canOperateNodes: canOperate = canManageCommunity,
  } = Route.useRouteContext();
  const tab = searchTab ?? defaultContentTab(canOrganize, canOperate);
  const api = useApiClient();
  const tenantId = useQuery(nodeByIdQueryOptions(api, nodeId)).data?.tenantId;
  const tenant = useQuery(tenantByIdQueryOptions(api, tenantId ?? ""));
  const authContext = useQuery(
    communityAuthContextQueryOptions(api, auth.activeOrganizationId ?? null),
  );
  const orgRole = authContext.data?.organization?.member?.role;
  const managesTenant =
    tenant.data?.orgId === auth.activeOrganizationId &&
    (orgRole === "owner" || orgRole === "admin");
  const canManage = auth.isAdmin || managesTenant;
  const canOnboard =
    tenant.data?.orgId === auth.activeOrganizationId && isOnboardingOrganizer(authContext.data);

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
          reviewImports={review === "imports"}
          tenantStatus={tenant.data?.status}
          canManage={canManage}
          canOnboard={canOnboard}
          profileLink={
            tenantId && canManage ? (
              <Link to="/tenant/$tenantId" params={{ tenantId }} search={{ nodeId }} />
            ) : undefined
          }
        />
      )}
    </PageContainer>
  );
}
