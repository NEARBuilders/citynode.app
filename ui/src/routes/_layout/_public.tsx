import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SimpleHeader } from "@/components/layout/simple-header";
import { NearBranding } from "@/components/near-branding";
import { UserNav } from "@/components/user-nav";

export const Route = createFileRoute("/_layout/_public")({
  component: PublicLayout,
});

function PublicLayout() {
  const { runtimeConfig } = Route.useRouteContext();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <SimpleHeader runtimeConfig={runtimeConfig} rightSlot={<UserNav />} />

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div className="flex-1 flex flex-col">
          <Outlet />
        </div>
        <footer className="shrink-0 flex items-center justify-center py-6">
          <NearBranding />
        </footer>
      </div>
    </div>
  );
}
