import { Outlet, useRouterState } from "@tanstack/react-router";
import type { ClientRuntimeConfig, SessionData } from "@/app";
import { getAppName } from "@/app";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { MobileTabBar } from "./mobile-tab-bar";
import { filterSidebarByRole, getUserRole, NAV_ITEMS, type SidebarItem } from "./nav-items";

interface AppShellProps {
  session: SessionData | null | undefined;
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  isAdmin?: boolean;
}

export function AppShell({ session, runtimeConfig, isAdmin = false }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const appName = getAppName(runtimeConfig);

  const visibleItems = filterSidebarByRole(
    NAV_ITEMS,
    getUserRole(!!session?.user, isAdmin),
  );

  const isActive = (item: SidebarItem) =>
    pathname === item.to || (item.to !== "/" && pathname.startsWith(`${item.to}/`));

  return (
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden">
      <AppSidebar items={visibleItems} appName={appName} isActive={isActive} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <AppHeader runtimeConfig={runtimeConfig} />
        <main className="flex-1 w-full min-h-0 overflow-y-auto pb-20 sm:pb-6">
          <div className="min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      <MobileTabBar items={visibleItems} isActive={isActive} />
    </div>
  );
}
