import { Outlet, useRouterState } from "@tanstack/react-router";
import type { ClientRuntimeConfig, SessionData } from "@/app";
import { getAppName } from "@/app";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { filterSidebarByRole, getUserRole, NAV_ITEMS, type SidebarItem } from "./nav-items";

interface AppShellProps {
  session: SessionData | null | undefined;
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  isAdmin?: boolean;
}

export function AppShell({ session, runtimeConfig, isAdmin = false }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const appName = getAppName(runtimeConfig);

  const visibleItems = filterSidebarByRole(NAV_ITEMS, getUserRole(!!session?.user, isAdmin));

  const isActive = (item: SidebarItem) =>
    pathname === item.to || (item.to !== "/" && pathname.startsWith(`${item.to}/`));

  return (
    <SidebarProvider className="flex-1 min-h-0">
      <AppSidebar items={visibleItems} appName={appName} isActive={isActive} />
      <SidebarInset className="min-h-0">
        <AppHeader runtimeConfig={runtimeConfig} />
        <main className="flex-1 w-full min-h-0 overflow-y-auto">
          <div className="min-h-full">
            <Outlet />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
