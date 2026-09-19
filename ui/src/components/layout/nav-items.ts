import {
  Boxes,
  Building2,
  CirclePlus,
  Compass,
  Home,
  Landmark,
  Network,
  Shield,
  Sparkles,
} from "lucide-react";

export type SidebarRole = "anon" | "member" | "admin";

interface NavManifestItem {
  label: string;
  icon?: string;
  group?: string;
  order?: number;
  to: string;
  mount: string;
}

export interface SidebarItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to: string;
  roleRequired: SidebarRole;
  children?: SidebarItem[];
  /** group the item belongs to (plugin nav manifest groups) */
  group?: string;
  /** ascending sort order inside the group */
  order?: number;
}

export const NAV_ITEMS: SidebarItem[] = [
  { icon: Compass, label: "explore", to: "/explore", roleRequired: "anon" },
  { icon: Sparkles, label: "discover", to: "/discover", roleRequired: "member" },
  {
    icon: Home,
    label: "dashboard",
    to: "/dashboard",
    roleRequired: "anon",
    children: [
      { icon: Home, label: "overview", to: "/dashboard", roleRequired: "anon" },
      { icon: Network, label: "my node", to: "/dashboard/node", roleRequired: "member" },
    ],
  },
  {
    icon: Boxes,
    label: "things",
    to: "/things",
    roleRequired: "member",
    children: [
      { icon: Boxes, label: "all things", to: "/things", roleRequired: "member" },
      { icon: CirclePlus, label: "new thing", to: "/things/new", roleRequired: "member" },
    ],
  },
  { icon: Landmark, label: "stake", to: "/stake", roleRequired: "anon" },
  { icon: Building2, label: "orgs", to: "/orgs", roleRequired: "anon" },
  { icon: Shield, label: "admin", to: "/admin", roleRequired: "admin" },
];

export function getUserRole(isAuthenticated: boolean, isAdmin: boolean): SidebarRole {
  if (isAdmin) return "admin";
  if (isAuthenticated) return "member";
  return "anon";
}

export function filterSidebarByRole(items: SidebarItem[], userRole: SidebarRole): SidebarItem[] {
  const matchesRole = (role: SidebarRole) => {
    if (role === "anon") return true;
    if (role === "member" && userRole !== "anon") return true;
    if (role === "admin" && userRole === "admin") return true;
    return false;
  };

  const filterChildren = (item: SidebarItem): SidebarItem | null => {
    if (!matchesRole(item.roleRequired)) return null;
    if (!item.children) return item;
    const children = item.children
      .map(filterChildren)
      .filter((child): child is SidebarItem => child !== null);
    if (children.length === 0) return null;
    return { ...item, children };
  };

  return items.map(filterChildren).filter((item): item is SidebarItem => item !== null);
}

const PLUGIN_ICON_MAP: Record<string, SidebarItem["icon"]> = {
  compass: Compass,
  sparkles: Sparkles,
  boxes: Boxes,
  home: Home,
  network: Network,
  landmark: Landmark,
  building2: Building2,
  shield: Shield,
  "circle-plus": CirclePlus,
};

export function pluginNavToSidebar(items: NavManifestItem[]): SidebarItem[] {
  return items
    .filter((item) => Boolean(item.label))
    .map((item, index) => ({
      icon: PLUGIN_ICON_MAP[item.icon ?? "boxes"] ?? Boxes,
      label: item.label,
      to: item.to,
      roleRequired: (item.mount === "public" || item.mount === "anon"
        ? "anon"
        : "member") as SidebarRole,
      group: item.group,
      order: item.order ?? index,
    }));
}

export function appendPluginSidebarItems(
  builtin: SidebarItem[],
  plugin: SidebarItem[],
): SidebarItem[] {
  const builtinTos = new Set(builtin.map((item) => item.to));
  return [...builtin, ...plugin.filter((item) => !builtinTos.has(item.to))];
}
