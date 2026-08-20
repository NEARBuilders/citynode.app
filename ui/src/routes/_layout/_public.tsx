import { createFileRoute, Outlet } from "@tanstack/react-router";
import { NearBranding } from "@/components/near-branding";
import { UserNav } from "@/components/user-nav";

export const Route = createFileRoute("/_layout/_public")({
  component: PublicLayout,
});

function PublicLayout() {
  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 flex items-center justify-end gap-2 px-4 sm:px-6 h-12">
        <UserNav />
      </div>

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
