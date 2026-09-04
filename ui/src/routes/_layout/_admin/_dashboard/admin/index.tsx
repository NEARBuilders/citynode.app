import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, Gavel, LayoutDashboard, Network, Settings, Users } from "lucide-react";
import { getAccount, useApiClient } from "@/app";
import { Badge, Button, Card, SectionHeader } from "@/components";
import { InfoRow } from "@/components/ui/info-row";
import { useNearAccount } from "@/lib/use-near-account";
import { pendingProposalCountQueryOptions } from "./proposals/-proposal-review";

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(pendingProposalCountQueryOptions(context.apiClient)),
  head: () => ({
    meta: [{ title: "Admin Dashboard | app" }],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { auth, tenant, tenantOrganizationSlug } = Route.useRouteContext();
  const apiClient = useApiClient();
  const platformAccount = getAccount();
  const user = auth?.user ?? null;
  const walletAccount = useNearAccount();
  const pendingProposalsQuery = useQuery(pendingProposalCountQueryOptions(apiClient));
  const pendingProposalCount = pendingProposalsQuery.data?.meta.total;

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Wallet" value={walletAccount ?? user?.name ?? "—"} mono />
        <StatCard label="Name" value={user?.name || user?.email || "—"} />
        <StatCard label="Role" value={user?.role ?? "—"} />
        <StatCard label="Platform account" value={platformAccount} mono />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Manage" sectionTestId="admin.section.manage" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <Network className="h-4 w-4" />
            </div>
            <h3
              className="text-base font-semibold text-foreground"
              data-testid="admin.heading.nodes"
            >
              Nodes
            </h3>
            <p className="text-sm text-muted-foreground">
              Inspect the node tree, validator health, and staking resolution.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/nodes">open nodes</Link>
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <Gavel className="h-4 w-4" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3
                className="text-base font-semibold text-foreground"
                data-testid="admin.heading.proposals"
              >
                Proposals
              </h3>
              {pendingProposalCount !== undefined && (
                <Badge variant="secondary">{pendingProposalCount} pending</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Review and approve thing submissions from the community.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/proposals">review proposals</Link>
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <h3
              className="text-base font-semibold text-foreground"
              data-testid="admin.heading.tenants"
            >
              Tenants
            </h3>
            <p className="text-sm text-muted-foreground">
              Create and manage tenant deployments for your organization.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin/tenants">
                <Building2 className="h-3.5 w-3.5" />
                open tenants
              </Link>
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <Building2 className="h-4 w-4" />
            </div>
            <h3
              className="text-base font-semibold text-foreground"
              data-testid="admin.heading.organizations"
            >
              Organizations
            </h3>
            <p className="text-sm text-muted-foreground">
              Manage organizations, members, roles, and invitations.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/orgs">
                <Users className="h-3.5 w-3.5" />
                open organizations
              </Link>
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <Settings className="h-4 w-4" />
            </div>
            <h3
              className="text-base font-semibold text-foreground"
              data-testid="admin.heading.settings"
            >
              Settings
            </h3>
            <p className="text-sm text-muted-foreground">
              Update your profile, auth methods, and security preferences.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">open settings</Link>
            </Button>
          </Card>
        </div>
      </section>

      {tenant && (
        <section className="space-y-3">
          <SectionHeader title="Tenant details" />
          <Card className="p-6 space-y-4">
            <div className="text-muted-foreground text-[11px] font-bold uppercase tracking-wider">
              Configuration
            </div>
            <div className="flex flex-col gap-2">
              <InfoRow label="name" value={tenant.name} />
              <InfoRow label="id" value={tenant.id} mono />
              <InfoRow label="account" value={tenant.accountId} mono />
              <InfoRow label="org Id" value={tenant.orgId} mono />
              <InfoRow
                label="created"
                value={tenant.createdAt ? new Date(tenant.createdAt).toLocaleDateString() : "—"}
              />
            </div>
          </Card>
        </section>
      )}

      {tenant && (
        <section className="space-y-3">
          <SectionHeader title="Members & permissions" />
          <Card className="p-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              This tenant is backed by an organization. Manage members, roles, and invitations
              there.
            </p>
            <Button asChild variant="outline" size="sm">
              {tenantOrganizationSlug ? (
                <Link to="/orgs/$slug" params={{ slug: tenantOrganizationSlug }}>
                  <Users className="h-3.5 w-3.5" />
                  open organization
                </Link>
              ) : (
                <Link to="/orgs">
                  <Users className="h-3.5 w-3.5" />
                  open organizations
                </Link>
              )}
            </Button>
          </Card>
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  const slug = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div
      className="border-2 border-outset border-border-strong bg-card p-4 rounded-[12px] shadow-sm space-y-1"
      data-testid={`admin.stat.${slug}`}
    >
      <div
        className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
        data-testid={`admin.stat.${slug}.label`}
      >
        {label}
      </div>
      <div
        className={`text-base font-bold text-foreground leading-tight ${mono ? "font-mono" : ""}`}
        data-testid={`admin.stat.${slug}.value`}
      >
        {value}
      </div>
    </div>
  );
}
