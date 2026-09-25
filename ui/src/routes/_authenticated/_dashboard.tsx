import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
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
  component: Outlet,
});
