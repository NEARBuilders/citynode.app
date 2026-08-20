import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Building2, Fuel, LayoutDashboard, Settings, Shield } from "lucide-react";
import { getAccount } from "@/app";
import { Badge, EmptyState, PageContainer, PageHeader } from "@/components";
import { useRelayerInfoQuery } from "@/lib/use-relayer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_layout/_admin/admin")({
  head: () => ({
    meta: [{ title: "Admin | app" }],
  }),
  beforeLoad: async ({ context }) => {
    const { apiClient, runtimeConfig } = context;
    const accountId = getAccount(runtimeConfig);
    let tenant: Awaited<ReturnType<typeof apiClient.resolveTenant>> | null = null;
    try {
      tenant = await apiClient.resolveTenant({ accountId });
    } catch {
      tenant = null;
    }
    return { tenant };
  },
  component: AdminPage,
});

function AdminPage() {
  const { tenant, session } = Route.useRouteContext();

  const activeOrgId = session?.session?.activeOrganizationId ?? null;
  const isMember = !!tenant && !!activeOrgId && activeOrgId === tenant.orgId;
  const isAdmin = session?.user?.role === "admin";
  const authorized = isMember || isAdmin;

  const { data: relayerInfo } = useRelayerInfoQuery();

  const relayerNeedsFunding =
    relayerInfo && relayerInfo.enabled === false && !!relayerInfo.accountId;

  if (tenant && !authorized) {
    return (
      <EmptyState
        icon={Shield}
        title="Not authorized"
        description={
          <>
            You need to be a member of <span className="font-mono">{tenant.id.slice(0, 8)}</span>'s
            organization to access tenant admin.
          </>
        }
        action={
          <div className="flex justify-center gap-2">
            <Link
              to="/"
              className="h-10 px-4 inline-flex items-center gap-1.5 text-sm font-medium border-2 border-outset border-border-strong bg-card text-foreground shadow-sm hover:shadow-md active:border-inset active:shadow-none transition-all duration-200 ease-out rounded-[12px]"
            >
              home
            </Link>
            <Link
              to="/orgs"
              className="h-10 px-4 inline-flex items-center gap-1.5 text-sm font-medium border-2 border-outset border-border-strong bg-card text-foreground shadow-sm hover:shadow-md active:border-inset active:shadow-none transition-all duration-200 ease-out rounded-[12px]"
            >
              organizations
            </Link>
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
            icon={Shield}
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
                <Link
                  to="/orgs/$slug"
                  params={{ slug: tenant.id.slice(0, 8) }}
                  className="text-foreground hover:underline font-mono"
                >
                  {tenant.id.slice(0, 8)}
                </Link>
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
            className="block border-2 border-outset border-destructive/40 bg-destructive/5 hover:bg-destructive/10 p-4 rounded-[12px] shadow-sm transition-all duration-200"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <Fuel className="h-5 w-5 text-destructive mt-0.5" />
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

        <AdminNav />

        <Outlet />
      </div>
    </PageContainer>
  );
}

const NAV_ITEMS = [
  { label: "dashboard", to: "/admin", icon: LayoutDashboard },
  { label: "tenants", to: "/admin/tenants", icon: Building2 },
  { label: "relayer", to: "/admin/relayer", icon: Fuel },
  { label: "system", to: "/admin/system", icon: Settings },
] as const;

function AdminNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) =>
    to === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(to);

  return (
    <nav className="flex flex-wrap gap-2">
      {NAV_ITEMS.map(({ label, to, icon: Icon }) => {
        const active = isActive(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              "inline-flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium border-2 border-outset border-border-strong rounded-[10px] shadow-sm transition-all duration-200 hover:shadow-md",
              active ? "bg-foreground text-background" : "bg-card text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
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
