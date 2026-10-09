import { createFileRoute, redirect } from "@tanstack/react-router";
import { getActiveRuntime } from "@/app";
import { resolveAppLocale, translateAppMessage } from "@/i18n/runtime";
import { pageTitle } from "@/lib/page-title";
import { tenantNodesQueryOptions } from "@/lib/queries/nodes";
import { tenantByKeyQueryOptions } from "@/lib/queries/tenants";
import { ensureCommunityHeaderData } from "../dashboard/node/-community-header";
import { selectTenantNode, TenantDetailContent } from "./-tenant-detail";

export const Route = createFileRoute("/_authenticated/_dashboard/tenant/$tenantId")({
  validateSearch: (search: Record<string, unknown>): { nodeId?: string } =>
    typeof search.nodeId === "string" && search.nodeId ? { nodeId: search.nodeId } : {},
  loaderDeps: ({ search }) => ({ nodeId: search.nodeId }),
  beforeLoad: async ({ context, params }) => {
    const gateway = getActiveRuntime(context.runtimeConfig)?.gatewayId ?? "";
    const tenant = await context.queryClient.fetchQuery({
      ...tenantByKeyQueryOptions(context.apiClient, params.tenantId, gateway),
      staleTime: 0,
    });
    if (!tenant) throw redirect({ to: "/dashboard" });
    return { tenantId: tenant.id };
  },
  loader: async ({ context, params, deps }) => {
    const nodes = await context.queryClient
      .ensureQueryData(tenantNodesQueryOptions(context.apiClient, context.tenantId))
      .catch(() => []);
    const node = selectTenantNode(nodes, deps.nodeId);
    if (node && deps.nodeId && deps.nodeId !== node.id) {
      throw redirect({
        to: "/tenant/$tenantId",
        params,
        search: { nodeId: node.id },
        replace: true,
      });
    }
    if (node) await ensureCommunityHeaderData(context, node.id);
  },
  head: ({ match }) => ({
    meta: [
      {
        title: pageTitle(
          translateAppMessage(
            "nav.communitySettings",
            undefined,
            resolveAppLocale(undefined, match.context.locale),
          ),
          match.context.runtimeConfig,
        ),
      },
    ],
  }),
  component: TenantDetail,
});

function TenantDetail() {
  const { tenantId, runtimeConfig } = Route.useRouteContext();
  const { nodeId } = Route.useSearch();
  return <TenantDetailContent tenantId={tenantId} nodeId={nodeId} runtimeConfig={runtimeConfig} />;
}
