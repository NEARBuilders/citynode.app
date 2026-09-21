import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import type { SidebarItem } from "./nav-items";
import { SidebarOrgSwitcher } from "./sidebar-org-switcher";
import { SidebarTeamSwitcher } from "./sidebar-team-switcher";
import { useIdentity } from "./use-identity";
import { useSwitchTeam } from "./use-switch-team";
import { useTeamWorkspace } from "./use-team-workspace";

interface AppSidebarProps {
  items: SidebarItem[];
  appName: string;
  pathname: string;
}

export function AppSidebar({ items, appName, pathname }: AppSidebarProps) {
  const { user, organizations, activeOrgId } = useIdentity();
  const { data: workspace } = useTeamWorkspace(!!user);
  const switchTeam = useSwitchTeam();
  const teams = workspace?.teams ?? [];
  const activeTeamId = workspace?.activeTeam?.id ?? null;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarOrgSwitcher
          appName={appName}
          organizations={organizations}
          activeOrgId={activeOrgId}
        />
        <SidebarTeamSwitcher
          teams={teams}
          activeTeamId={activeTeamId}
          isPending={switchTeam.isPending}
          onSelect={(teamId) => switchTeam.mutate(teamId)}
        />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map((item) => (
              <SidebarNavItem key={item.label} item={item} pathname={pathname} />
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function toSlug(label: string) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

function isPathActive(pathname: string, to: string) {
  return pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
}

function SidebarNavItem({ item, pathname }: { item: SidebarItem; pathname: string }) {
  if (item.children && item.children.length > 0) {
    return <SidebarNavGroup item={item} pathname={pathname} />;
  }
  return <SidebarNavLeaf item={item} pathname={pathname} />;
}

function SidebarNavLeaf({ item, pathname }: { item: SidebarItem; pathname: string }) {
  const Icon = item.icon;
  const active = isPathActive(pathname, item.to);
  const slug = toSlug(item.label);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
        <Link to={item.to} preload="intent" data-testid={`sidebar-nav-${slug}`}>
          <Icon />
          <span className="capitalize">{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function SidebarNavSubItem({ item, pathname }: { item: SidebarItem; pathname: string }) {
  const Icon = item.icon;
  const active = isPathActive(pathname, item.to);
  const slug = toSlug(item.label);
  return (
    <SidebarMenuSubItem>
      <SidebarMenuSubButton asChild isActive={active}>
        <Link to={item.to} preload="intent" data-testid={`sidebar-nav-${slug}`}>
          <Icon />
          <span className="capitalize">{item.label}</span>
        </Link>
      </SidebarMenuSubButton>
    </SidebarMenuSubItem>
  );
}

function SidebarNavGroup({ item, pathname }: { item: SidebarItem; pathname: string }) {
  const Icon = item.icon;
  const active = isPathActive(pathname, item.to);
  const children = item.children ?? [];
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (active) {
      setOpen(true);
    }
  }, [active]);

  const slug = toSlug(item.label);

  return (
    <CollapsiblePrimitive.Root
      asChild
      className="group/collapsible"
      open={open}
      onOpenChange={setOpen}
    >
      <SidebarMenuItem>
        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
          <Link
            to={item.to}
            preload="intent"
            onClick={() => setOpen(true)}
            data-testid={`sidebar-nav-${slug}`}
          >
            <Icon />
            <span className="capitalize">{item.label}</span>
          </Link>
        </SidebarMenuButton>
        <CollapsiblePrimitive.Trigger asChild>
          <SidebarMenuAction
            aria-label={`Toggle ${item.label}`}
            data-testid={`sidebar-nav-${slug}-toggle`}
          >
            <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuAction>
        </CollapsiblePrimitive.Trigger>
        <CollapsiblePrimitive.Content className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub>
            {children.map((child) => (
              <SidebarNavSubItem key={child.label} item={child} pathname={pathname} />
            ))}
          </SidebarMenuSub>
        </CollapsiblePrimitive.Content>
      </SidebarMenuItem>
    </CollapsiblePrimitive.Root>
  );
}
