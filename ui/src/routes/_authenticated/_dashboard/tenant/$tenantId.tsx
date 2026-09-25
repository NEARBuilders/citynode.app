import { createFileRoute } from "@tanstack/react-router";
import { getAppName } from "@/app";
import { TenantDetailContent } from "./-tenant-detail";

export const Route = createFileRoute("/_authenticated/_dashboard/tenant/$tenantId")({
  head: ({ match }) => ({
    meta: [{ title: `Community settings | ${getAppName(match.context.runtimeConfig)}` }],
  }),
  component: TenantDetail,
});

function TenantDetail() {
  const { tenantId } = Route.useParams();
  const { runtimeConfig } = Route.useRouteContext();
  return <TenantDetailContent tenantId={tenantId} runtimeConfig={runtimeConfig} />;
}
