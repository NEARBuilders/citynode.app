import { GasPumpIcon, ShieldIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { getAccount, useApiClient } from "@/app";
import { Badge, Button, EmptyState, PageContainer, PageHeader } from "@/components";
import { organizationByIdQueryOptions } from "@/lib/queries/organizations";
import { useRelayerInfoQuery } from "@/lib/use-relayer";
import { AdminNav } from "./-admin-nav";
import { StatCard } from "./-stat-card";
import { pendingProposalCountQueryOptions } from "./admin/proposals/-proposal-review";

export const Route = createFileRoute("/_admin/_dashboard/admin")({
  head: () => ({
    meta: [{ title: "Admin | app" }],
  }),
  beforeLoad: async ({ context }) => {
    const { apiClient, queryClient, runtimeConfig } = context;
    const accountId = getAccount(runtimeConfig);
    let tenant: Awaited<ReturnType<typeof apiClient.resolveTenant>> | null = null;
    try {
      tenant = await apiClient.resolveTenant({ accountId });
    } catch {
      tenant = null;
    }
    const tenantOrganization = tenant?.orgId
      ? await queryClient
          .ensureQueryData(organizationByIdQueryOptions(apiClient, tenant.orgId))
          .catch(() => null)
      : null;
    const tenantOrganizationSlug = tenantOrganization?.slug ?? null;
    return { tenant, tenantOrganizationSlug };
  },
  component: AdminPage,
});

function AdminPage() {
  const { tenant, tenantOrganizationSlug, session } = Route.useRouteContext();
  const apiClient = useApiClient();

  const activeOrgId = session?.session?.activeOrganizationId ?? null;
  const isMember = !!tenant && !!activeOrgId && activeOrgId === tenant.orgId;
  const isAdmin = session?.user?.role === "admin";
  const authorized = isMember || isAdmin;

  const { data: relayerInfo } = useRelayerInfoQuery();
  const pendingProposalsQuery = useQuery(pendingProposalCountQueryOptions(apiClient));

  const relayerNeedsFunding =
    relayerInfo && relayerInfo.enabled === false && !!relayerInfo.accountId;

  if (tenant && !authorized) {
    return (
      <EmptyState
        icon={ShieldIcon}
        title="Not authorized"
        description={
          <>
            You need to be a member of <span className="font-mono">{tenant.id.slice(0, 8)}</span>'s
            organization to access tenant admin.
          </>
        }
        action={
          <div className="flex justify-center gap-2">
            <Button variant="outline" nativeButton={false} render={<Link to="/" />}>
              home
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link to="/orgs" />}>
              organizations
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <PageContainer variant="wide">
      <div className="space-y-8">
        {tenant && (
          <PageHeader
            icon={ShieldIcon}
            label="Admin"
            title={tenant.name}
            subtitle={`${tenant.id.slice(0, 8)} · ${tenant.accountId}`}
          />
        )}

        {tenant && (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Subdomain" value={tenant.id.slice(0, 8)} mono />
            <StatCard label="Account" value={tenant.accountId} mono />
            <StatCard
              label="Organization"
              value={
                tenantOrganizationSlug ? (
                  <Link
                    to="/orgs/$slug"
                    params={{ slug: tenantOrganizationSlug }}
                    className="font-mono text-foreground hover:underline"
                  >
                    {tenantOrganizationSlug}
                  </Link>
                ) : (
                  <Link to="/orgs" className="text-foreground hover:underline">
                    organizations
                  </Link>
                )
              }
            />
            <StatCard
              label="Created"
              value={tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
            />
          </section>
        )}

        {relayerNeedsFunding && (
          <Link
            to="/admin/relayer"
            className="block rounded-xl border border-destructive/40 bg-destructive/5 p-4 transition-colors hover:bg-destructive/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <GasPumpIcon className="h-5 w-5 text-destructive mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Relayer needs funding</p>
                  <p className="text-xs text-muted-foreground">
                    The ephemeral relayer{" "}
                    <span className="font-mono text-foreground">{relayerInfo?.accountId}</span> has
                    zero balance — gasless relay is disabled. Fund it with NEAR to enable tenant +
                    app meta publishes.
                  </p>
                </div>
              </div>
              <Badge variant="destructive">action needed</Badge>
            </div>
          </Link>
        )}

        <AdminNav pendingProposalCount={pendingProposalsQuery.data?.meta.total} />

        <Outlet />
      </div>
    </PageContainer>
  );
}
