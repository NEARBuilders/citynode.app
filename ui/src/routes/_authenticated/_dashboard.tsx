import { createFileRoute, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { areaForPath, isPathAllowed, teamWorkspaceQueryOptions } from "@/lib/team-workspace";

export const Route = createFileRoute("/_authenticated/_dashboard")({
  beforeLoad: async ({ context, location }) => {
    const area = areaForPath(location.pathname);
    if (!area) return;
    const workspace = await context.queryClient
      .ensureQueryData(teamWorkspaceQueryOptions(context.apiClient))
      .catch(() => null);
    if (workspace && !isPathAllowed(workspace, location.pathname)) {
      throw redirect({ to: "/dashboard", search: { restricted: area } });
    }
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  const { runtimeConfig, session, pluginNav } = Route.useRouteContext();
  const isAdmin = session?.user?.role === "admin";
  return (
    <AppShell
      runtimeConfig={runtimeConfig}
      session={session}
      isAdmin={isAdmin}
      pluginNav={pluginNav}
    />
  );
}
