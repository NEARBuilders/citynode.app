import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";
import { AppInfoPopover } from "./_dashboard/admin/-app-info-popover";

export const Route = createFileRoute("/_admin/_dashboard")({
  component: AdminDashboardLayout,
});

function AdminDashboardLayout() {
  const { runtimeConfig, session, pluginNav } = Route.useRouteContext();
  const isAdmin = session?.user?.role === "admin";
  return (
    <AppShell
      runtimeConfig={runtimeConfig}
      session={session}
      isAdmin={isAdmin}
      pluginNav={pluginNav}
      headerActions={<AppInfoPopover runtimeConfig={runtimeConfig} session={session} />}
    />
  );
}
