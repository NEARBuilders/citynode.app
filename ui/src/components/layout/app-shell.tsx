import { Outlet, useRouterState } from "@tanstack/react-router";
import type { ClientRuntimeConfig, SessionData } from "@/app";
import { getAppName } from "@/app";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import {
  appendPluginSidebarItems,
  filterSidebarByRole,
  getUserRole,
  NAV_ITEMS,
  pluginNavToSidebar,
} from "./nav-items";

interface AppShellProps {
  session: SessionData | null | undefined;
  runtimeConfig?: Partial<ClientRuntimeConfig>;
  isAdmin?: boolean;
  /** nav manifest derived from grafted plugin subtrees */
  pluginNav?: { items: Parameters<typeof pluginNavToSidebar>[0] };
}

export function AppShell({ session, runtimeConfig, isAdmin = false, pluginNav }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const appName = getAppName(runtimeConfig);

  const builtin = filterSidebarByRole(NAV_ITEMS, getUserRole(!!session?.user, isAdmin));
  const visibleItems = pluginNav?.items?.length
    ? filterSidebarByRole(
        appendPluginSidebarItems(builtin, pluginNavToSidebar(pluginNav.items)),
        getUserRole(!!session?.user, isAdmin),
      )
    : builtin;

  return (
    <SidebarProvider className="flex-1 min-h-0">
      <AppSidebar items={visibleItems} appName={appName} pathname={pathname} />
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
