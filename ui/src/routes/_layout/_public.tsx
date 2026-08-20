import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PublicShell, PublicShellFooter } from "@/components/layout/public-shell";

export const Route = createFileRoute("/_layout/_public")({
  component: PublicLayout,
});

function PublicLayout() {
  const { runtimeConfig } = Route.useRouteContext();

  return (
    <PublicShell runtimeConfig={runtimeConfig} footer={<PublicShellFooter />}>
      <Outlet />
    </PublicShell>
  );
}
