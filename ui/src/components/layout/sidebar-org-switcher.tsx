import { Link } from "@tanstack/react-router";
import { Building2, Check, ChevronsUpDown, Plus } from "lucide-react";
import type { Organization } from "@/app";
import { useAuthClient } from "@/app";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

interface SidebarOrgSwitcherProps {
  appName: string;
  organizations: Organization[];
  activeOrgId?: string | null;
  onSwitch?: (orgId: string) => void;
}

export function SidebarOrgSwitcher({
  appName,
  organizations,
  activeOrgId,
  onSwitch,
}: SidebarOrgSwitcherProps) {
  const auth = useAuthClient();
  const activeOrg = organizations.find((o) => o.id === activeOrgId);

  const handleSwitch = async (orgId: string) => {
    if (orgId === activeOrgId) return;
    const { error } = await auth.organization.setActive({ organizationId: orgId });
    if (!error) {
      onSwitch?.(orgId);
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
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
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              organizations
            </DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                className="gap-2 p-2"
                onClick={() => handleSwitch(org.id)}
              >
                <div className="flex size-6 items-center justify-center rounded-sm border border-border">
                  <Building2 className="size-3.5 shrink-0" />
                </div>
                <span className="truncate min-w-0 flex-1">{org.name}</span>
                {org.id === activeOrgId && <Check className="size-3.5 text-muted-foreground" />}
              </DropdownMenuItem>
            ))}
            {organizations.length === 0 && (
              <DropdownMenuItem disabled className="text-muted-foreground">
                no organizations
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 p-2">
              <Link to="/orgs/new">
                <div className="flex size-6 items-center justify-center rounded-md border border-border bg-background">
                  <Plus className="size-4" />
                </div>
                <span className="font-medium text-muted-foreground">new organization</span>
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
