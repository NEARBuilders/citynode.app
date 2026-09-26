import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useApiClient } from "@/app";
import { Button, PageContainer, PageHeader, Skeleton } from "@/components";
import { EventOnboardingPanel } from "@/components/discovery/event-onboarding";
import { ProfileEditor } from "@/components/discovery/profile-editor";
import { pageTitle } from "@/lib/page-title";
import { CommunityNav } from "../../dashboard/node/-community-nav";

type ContentTab = "events" | "profile" | "onboarding";

const TABS: readonly ContentTab[] = ["events", "profile", "onboarding"];

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId/content")({
  validateSearch: (search: Record<string, unknown>): { tab?: ContentTab } =>
    TABS.includes(search.tab as ContentTab) ? { tab: search.tab as ContentTab } : {},
  head: ({ match }) => ({
    meta: [{ title: pageTitle("Events & profile", match.context.runtimeConfig) }],
  }),
  component: CommunityContent,
});

function CommunityContent() {
  const { nodeId } = Route.useParams();
  const { tab = "events" } = Route.useSearch();
  const { auth } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
  const api = useApiClient();
  const node = useQuery({
    queryKey: ["content-node", nodeId],
    queryFn: () => api.getNode({ nodeId }),
  });
  const authContext = useQuery({
    queryKey: ["home-auth-context", auth.activeOrganizationId ?? ""],
    queryFn: () => api.auth.getContext().catch(() => null),
    staleTime: 30 * 1000,
  });
  const orgRole = authContext.data?.organization?.member?.role;
  const canManage = auth.isAdmin || orgRole === "owner" || orgRole === "admin";
  const selectTab = (next: ContentTab) =>
    navigate({ search: { tab: next }, replace: true, resetScroll: false });

  return (
    <PageContainer variant="wide">
      <header className="flex flex-col gap-6">
        <PageHeader
          headerTestId="content.heading"
          title={node.data?.name ?? <Skeleton className="h-10 w-64" />}
          actions={
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/explore" search={{ node: nodeId }} />}
            >
              View on Explore
              <ArrowUpRightIcon />
            </Button>
          }
        />
        <CommunityNav
          active={tab === "onboarding" ? "onboarding" : "content"}
          nodeId={nodeId}
          tenantId={node.data?.tenantId}
          canManage={canManage}
          replace
          testIds={{ onboarding: "content-tab-onboarding" }}
        />
      </header>
      {tab === "onboarding" ? (
        <EventOnboardingPanel nodeId={nodeId} organizationId={auth.activeOrganizationId} />
      ) : (
        <ProfileEditor nodeId={nodeId} tab={tab} onTabChange={selectTab} />
      )}
    </PageContainer>
  );
}
