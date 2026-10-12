import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { canManageCommunity, canOrganizeEvents } from "@/lib/team-workspace";
import { communityAuthContextQueryOptions } from "../dashboard/node/-community-header";

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId")({
  beforeLoad: async ({ context }) => {
    const authContext = await context.queryClient
      .ensureQueryData(
        communityAuthContextQueryOptions(context.apiClient, context.auth.activeOrganizationId),
      )
      .catch(() => null);
    const canManage = context.auth.user?.role === "admin" || canManageCommunity(authContext);
    if (!canManage && !canOrganizeEvents(authContext)) {
      throw redirect({ to: "/dashboard", search: { restricted: "owners" } });
    }
    return { canManageCommunity: canManage };
  },
  component: Outlet,
});
