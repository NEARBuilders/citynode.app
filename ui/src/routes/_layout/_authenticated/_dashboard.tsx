import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_layout/_authenticated/_dashboard")({
  component: DashboardLayout,
});

function DashboardLayout() {
  const { runtimeConfig, session } = Route.useRouteContext();
  const isAdmin = session?.user?.role === "admin";
  return <AppShell runtimeConfig={runtimeConfig} session={session} isAdmin={isAdmin} />;
}
