import { Link } from "@tanstack/react-router";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { SidebarItem } from "./nav-items";
import { SidebarOrgSwitcher } from "./sidebar-org-switcher";
import { SidebarUserNav } from "./sidebar-user-nav";
import { useIdentity } from "./use-identity";

interface AppSidebarProps {
  items: SidebarItem[];
  appName: string;
  isActive: (item: SidebarItem) => boolean;
}

export function AppSidebar({ items, appName, isActive }: AppSidebarProps) {
  const { organizations, activeOrgId } = useIdentity();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarOrgSwitcher
          appName={appName}
          organizations={organizations}
          activeOrgId={activeOrgId}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                    <Link to={item.to} preload="intent">
                      <Icon />
                      <span className="capitalize">{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarUserNav />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
