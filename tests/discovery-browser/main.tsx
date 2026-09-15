import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { DiscoveryExplorer } from "../../ui/src/components/discovery/discovery-explorer";
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
        {typeof search.editor === "string" ? (
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
const router = createRouter({ routeTree: root.addChildren([route]), context: { apiClient } });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
