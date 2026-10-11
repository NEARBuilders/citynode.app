import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { communityAuthContextQueryOptions } from "../dashboard/node/-community-header";
import { canManageCommunity } from "../dashboard/node/-node-access";

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId")({
  beforeLoad: async ({ context }) => {
    const authContext = await context.queryClient
      .ensureQueryData(
        communityAuthContextQueryOptions(context.apiClient, context.auth.activeOrganizationId),
      )
      .catch(() => null);
    if (!canManageCommunity(context.auth.user?.role, authContext?.organization?.member?.role)) {
      throw redirect({ to: "/dashboard", search: { restricted: "owners" } });
    }
  },
  component: Outlet,
});
