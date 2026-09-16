import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { ActivityDetail } from "../../ui/src/components/discovery/activity-detail";
import { DiscoveryExplorer } from "../../ui/src/components/discovery/discovery-explorer";
import { DiscoveryStudio } from "../../ui/src/components/discovery/discovery-studio";
import { ProfileEditor } from "../../ui/src/components/discovery/profile-editor";
import { createApiClient } from "../../ui/src/lib/api";
import "../../ui/src/styles.css";
const apiClient = createApiClient({ hostUrl: window.location.origin, rpcBase: "/api/rpc" });
const root = createRootRouteWithContext<{ apiClient: typeof apiClient }>()();
const route = createRoute({
  getParentRoute: () => root,
  path: "/",
  validateSearch: (s: Record<string, unknown>) => s,
  component: () => {
    const search = route.useSearch();
    const navigate = route.useNavigate();
    return (
      <main className="p-6">
        {search.studio ? (
          <DiscoveryStudio />
        ) : typeof search.editor === "string" ? (
          <ProfileEditor nodeId={search.editor} />
        ) : (
          <DiscoveryExplorer
            api={apiClient}
            search={search}
            navigate={(next) => navigate({ search: next })}
          />
        )}
      </main>
    );
  },
});
const detailRoute = createRoute({
  getParentRoute: () => root,
  path: "/activity/$activityId",
  validateSearch: (s: Record<string, unknown>) => ({
    node: typeof s.node === "string" ? s.node : undefined,
    campaign: typeof s.campaign === "string" ? s.campaign : undefined,
  }),
  component: () => (
    <ActivityDetail activityId={detailRoute.useParams().activityId} {...detailRoute.useSearch()} />
  ),
});
const router = createRouter({
  routeTree: root.addChildren([route, detailRoute]),
  context: { apiClient },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
