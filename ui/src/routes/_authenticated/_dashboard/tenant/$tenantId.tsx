import { createFileRoute } from "@tanstack/react-router";
import { TenantDetailContent } from "./-tenant-detail";

export const Route = createFileRoute("/_authenticated/_dashboard/tenant/$tenantId")({
  head: () => ({ meta: [{ title: "Tenant | app" }] }),
  component: TenantDetail,
});

function TenantDetail() {
  const { tenantId } = Route.useParams();
  const { runtimeConfig } = Route.useRouteContext();
  return <TenantDetailContent tenantId={tenantId} runtimeConfig={runtimeConfig} />;
}
