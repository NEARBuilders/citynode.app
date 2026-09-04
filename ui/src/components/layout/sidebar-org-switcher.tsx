import { Building2, ChevronsUpDown } from "lucide-react";
import type { Organization } from "@/app";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { OrgSwitcherMenuContent } from "./org-switcher-menu";

interface SidebarOrgSwitcherProps {
  appName: string;
  organizations: Organization[];
  activeOrgId?: string | null;
}

export function SidebarOrgSwitcher({
  appName,
  organizations,
  activeOrgId,
}: SidebarOrgSwitcherProps) {
  const activeOrg = organizations.find((o) => o.id === activeOrgId);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              data-testid="org-switcher"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg border-2 border-outset border-border-strong bg-card text-foreground shrink-0">
                <Building2 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{activeOrg?.name ?? appName}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {activeOrg ? "organization" : "workspace"}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <OrgSwitcherMenuContent
            organizations={organizations}
            activeOrgId={activeOrgId}
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
            itemVariant="iconTile"
          />
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
