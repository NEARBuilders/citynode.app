import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_layout/_admin/_dashboard")({
  component: AdminDashboardLayout,
});

function AdminDashboardLayout() {
  const { runtimeConfig, session } = Route.useRouteContext();
  const isAdmin = session?.user?.role === "admin";
  return <AppShell runtimeConfig={runtimeConfig} session={session} isAdmin={isAdmin} />;
}
