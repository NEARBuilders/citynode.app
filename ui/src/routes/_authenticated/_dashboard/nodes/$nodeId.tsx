import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { nodeByIdQueryOptions } from "@/lib/queries/nodes";
import { tenantByIdQueryOptions } from "@/lib/queries/tenants";
import { hasNodeAccess, isActiveCommunityTenant, resolveNodeAccess } from "@/lib/team-workspace";
import { communityAuthContextQueryOptions } from "../dashboard/node/-community-header";

export const Route = createFileRoute("/_authenticated/_dashboard/nodes/$nodeId")({
  beforeLoad: async ({ context, params }) => {
    const { queryClient, apiClient } = context;
    const activeOrganizationId = context.auth.activeOrganizationId;
    const platformAdmin = context.auth.user?.role === "admin";
    const [authContext, tenant] = await Promise.all([
      queryClient
        .ensureQueryData(communityAuthContextQueryOptions(apiClient, activeOrganizationId))
        .catch(() => null),
      queryClient
        .ensureQueryData(nodeByIdQueryOptions(apiClient, params.nodeId))
        .then((node) =>
          node?.tenantId
            ? queryClient.ensureQueryData(tenantByIdQueryOptions(apiClient, node.tenantId))
            : null,
        )
        .catch(() => null),
    ]);
    const inCommunity = isActiveCommunityTenant(tenant, activeOrganizationId);
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
