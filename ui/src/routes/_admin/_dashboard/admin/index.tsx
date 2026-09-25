import {
  BankIcon,
  GavelIcon,
  GearIcon,
  SquaresFourIcon,
  TreeStructureIcon,
  UsersIcon,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { getAccount, pluginPath, useApiClient } from "@/app";
import { Badge, Button, Card, SectionHeader } from "@/components";
import { InfoRow } from "@/components/info-row";
import { useNearAccount } from "@/lib/use-near-account";
import { pendingProposalCountQueryOptions } from "./proposals/-proposal-review";

export const Route = createFileRoute("/_admin/_dashboard/admin/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(pendingProposalCountQueryOptions(context.apiClient)),
  head: () => ({
    meta: [{ title: "Admin Dashboard | app" }],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { auth, tenant, tenantOrganizationSlug, runtimeConfig } = Route.useRouteContext();
  const apiClient = useApiClient();
  // Read from route context, not the window-only helper — a bare getAccount()
  // falls back to the default account on the server and hydrates to a
  // different text, tearing the tree down client-side.
  const platformAccount = getAccount(runtimeConfig);
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <TreeStructureIcon className="h-4 w-4" />
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
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/admin/nodes" />}
            >
              open nodes
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GavelIcon className="h-4 w-4" />
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
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/admin/proposals" />}
            >
              review proposals
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <SquaresFourIcon className="h-4 w-4" />
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
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to="/admin/tenants" />}
            >
              <BankIcon className="h-3.5 w-3.5" />
              open tenants
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BankIcon className="h-4 w-4" />
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
            <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/orgs" />}>
              <UsersIcon className="h-3.5 w-3.5" />
              open organizations
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <GearIcon className="h-4 w-4" />
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
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link to={pluginPath("/settings")} />}
            >
              open settings
            </Button>
          </Card>
        </div>
      </section>

      {tenant && (
        <section className="space-y-3">
          <SectionHeader title="Tenant details" />
          <Card className="p-6 space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Configuration</div>
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
            {tenantOrganizationSlug ? (
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<Link to="/orgs/$slug" params={{ slug: tenantOrganizationSlug }} />}
              >
                <UsersIcon className="h-3.5 w-3.5" />
                open organization
              </Button>
            ) : (
              <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/orgs" />}>
                <UsersIcon className="h-3.5 w-3.5" />
                open organizations
              </Button>
            )}
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
      className="flex flex-col gap-1 rounded-xl border border-border bg-card p-4"
      data-testid={`admin.stat.${slug}`}
    >
      <div
        className="text-sm font-medium text-muted-foreground"
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
