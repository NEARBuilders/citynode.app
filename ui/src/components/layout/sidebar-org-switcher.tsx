import { BankIcon, CaretUpDownIcon } from "@phosphor-icons/react";
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
          <DropdownMenuTrigger render={<SidebarMenuButton size="lg" data-testid="org-switcher" />}>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg border border-border bg-card text-foreground shrink-0">
              <BankIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{activeOrg?.name ?? appName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {activeOrg ? "organization" : "workspace"}
              </span>
            </div>
            <CaretUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <OrgSwitcherMenuContent
            organizations={organizations}
            activeOrgId={activeOrgId}
            className="w-(--anchor-width) min-w-56"
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
