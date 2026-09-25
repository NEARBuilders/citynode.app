import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { CaretRightIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
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
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={<Link to={item.to} preload="intent" data-testid={`sidebar-nav-${slug}`} />}
      >
        <Icon />
        <span className="capitalize">{item.label}</span>
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
      <SidebarMenuSubButton
        isActive={active}
        render={<Link to={item.to} preload="intent" data-testid={`sidebar-nav-${slug}`} />}
      >
        <Icon />
        <span className="capitalize">{item.label}</span>
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
      className="group/collapsible"
      open={open}
      onOpenChange={setOpen}
      render={<SidebarMenuItem />}
    >
      <SidebarMenuButton
        isActive={active}
        tooltip={item.label}
        render={
          <Link
            to={item.to}
            preload="intent"
            onClick={() => setOpen(true)}
            data-testid={`sidebar-nav-${slug}`}
          />
        }
      >
        <Icon />
        <span className="capitalize">{item.label}</span>
      </SidebarMenuButton>
      <CollapsiblePrimitive.Trigger
        render={
          <SidebarMenuAction
            aria-label={`Toggle ${item.label}`}
            data-testid={`sidebar-nav-${slug}-toggle`}
          />
        }
      >
        <CaretRightIcon className="transition-transform duration-200 group-data-open/collapsible:rotate-90" />
      </CollapsiblePrimitive.Trigger>
      <CollapsiblePrimitive.Panel className="h-(--collapsible-panel-height) overflow-hidden transition-all duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
        <SidebarMenuSub>
          {children.map((child) => (
            <SidebarNavSubItem key={child.label} item={child} pathname={pathname} />
          ))}
        </SidebarMenuSub>
      </CollapsiblePrimitive.Panel>
    </CollapsiblePrimitive.Root>
  );
}
