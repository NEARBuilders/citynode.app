import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, LayoutDashboard, Settings, Users } from "lucide-react";
import { getAccount, useAuthClient } from "@/app";
import { Button, Card, SectionHeader } from "@/components";
import { InfoRow } from "@/components/ui/info-row";

export const Route = createFileRoute("/_layout/_admin/_dashboard/admin/")({
  head: () => ({
    meta: [{ title: "Admin Dashboard | app" }],
  }),
  component: AdminDashboard,
});

function AdminDashboard() {
  const { auth, tenant } = Route.useRouteContext();
  const authClient = useAuthClient();
  const platformAccount = getAccount();
  const user = auth?.user ?? null;
  const walletAccount = authClient.near.getAccountId();

  return (
    <div className="space-y-8">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Wallet" value={walletAccount ?? user?.name ?? "—"} mono />
        <StatCard label="Name" value={user?.name || user?.email || "—"} />
        <StatCard label="Role" value={user?.role ?? "—"} />
        <StatCard label="Platform account" value={platformAccount} mono />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Manage" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="p-6 space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-foreground text-background">
              <LayoutDashboard className="h-4 w-4" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Tenants</h3>
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
            <h3 className="text-base font-semibold text-foreground">Organizations</h3>
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
            <h3 className="text-base font-semibold text-foreground">Settings</h3>
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
              <Link to="/orgs/$slug" params={{ slug: tenant.id.slice(0, 8) }}>
                <Users className="h-3.5 w-3.5" />
                open organization
              </Link>
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
  return (
    <div className="border-2 border-outset border-border-strong bg-card p-4 rounded-[12px] shadow-sm space-y-1">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-sm text-foreground break-all ${mono ? "font-mono text-xs" : "font-semibold"}`}
      >
        {value}
      </div>
    </div>
  );
}
