import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import { tenantByOrgQueryOptions } from "@/lib/queries/tenants";
import { hasNodeAccess, isActiveCommunityNode, resolveNodeAccess } from "@/lib/team-workspace";
import { communityAuthContextQueryOptions } from "../dashboard/node/-community-header";

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId")({
  beforeLoad: async ({ context, params }) => {
    const { queryClient, apiClient } = context;
    const activeOrganizationId = context.auth.activeOrganizationId;
    const platformAdmin = context.auth.user?.role === "admin";
    const [authContext, node, activeTenant] = await Promise.all([
      queryClient
        .ensureQueryData(communityAuthContextQueryOptions(apiClient, activeOrganizationId))
        .catch(() => null),
      queryClient.ensureQueryData(nodeByIdQueryOptions(apiClient, params.nodeId)).catch(() => null),
      activeOrganizationId
        ? queryClient
            .ensureQueryData(tenantByOrgQueryOptions(apiClient, activeOrganizationId))
            .catch(() => null)
        : null,
    ]);
    const inCommunity = isActiveCommunityNode(node, activeTenant?.id);
    if (!platformAdmin && !inCommunity) {
      throw redirect({ to: "/dashboard", search: { restricted: "community" } });
    }
    const access = resolveNodeAccess({ context: authContext, platformAdmin, inCommunity });
    if (!hasNodeAccess(access)) {
      throw redirect({ to: "/dashboard", search: { restricted: "owners" } });
    }
    return access;
  },
  component: Outlet,
});
