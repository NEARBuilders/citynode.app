import {
  BankIcon,
  BuildingsIcon,
  CompassIcon,
  CubeIcon,
  HouseIcon,
  NetworkIcon,
  PlusCircleIcon,
  ShieldIcon,
  SparkleIcon,
} from "@phosphor-icons/react";
import type { FeatureArea } from "@/lib/feature-areas";

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
  area?: FeatureArea;
  children?: SidebarItem[];
  /** group the item belongs to (plugin nav manifest groups) */
  group?: string;
  /** ascending sort order inside the group */
  order?: number;
}

export const NAV_ITEMS: SidebarItem[] = [
  { icon: CompassIcon, label: "explore", to: "/explore", roleRequired: "anon" },
  { icon: SparkleIcon, label: "discover", to: "/discover", roleRequired: "member" },
  {
    icon: HouseIcon,
    label: "dashboard",
    to: "/dashboard",
    roleRequired: "anon",
    children: [
      { icon: HouseIcon, label: "overview", to: "/dashboard", roleRequired: "anon" },
      {
        icon: NetworkIcon,
        label: "my node",
        to: "/dashboard/node",
        roleRequired: "member",
        area: "node-operations",
      },
    ],
  },
  {
    icon: CubeIcon,
    label: "things",
    to: "/things",
    roleRequired: "member",
    area: "things",
    children: [
      { icon: CubeIcon, label: "all things", to: "/things", roleRequired: "member" },
      { icon: PlusCircleIcon, label: "new thing", to: "/things/new", roleRequired: "member" },
    ],
  },
  { icon: BankIcon, label: "stake", to: "/stake", roleRequired: "anon", area: "stake" },
  { icon: BuildingsIcon, label: "orgs", to: "/orgs", roleRequired: "anon" },
  { icon: ShieldIcon, label: "admin", to: "/admin", roleRequired: "admin" },
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

export function filterSidebarByArea(
  items: SidebarItem[],
  allowedAreas: readonly FeatureArea[] | null,
): SidebarItem[] {
  if (!allowedAreas) return items;
  const visible = (item: SidebarItem): SidebarItem | null => {
    if (item.area && !allowedAreas.includes(item.area)) return null;
    if (!item.children) return item;
    const children = item.children
      .map(visible)
      .filter((child): child is SidebarItem => child !== null);
    return { ...item, children };
  };
  return items.map(visible).filter((item): item is SidebarItem => item !== null);
}

const PLUGIN_ICON_MAP: Record<string, SidebarItem["icon"]> = {
  compass: CompassIcon,
  sparkles: SparkleIcon,
  boxes: CubeIcon,
  home: HouseIcon,
  network: NetworkIcon,
  landmark: BankIcon,
  building2: BuildingsIcon,
  shield: ShieldIcon,
  "circle-plus": PlusCircleIcon,
};

export function pluginNavToSidebar(items: NavManifestItem[]): SidebarItem[] {
  return items
    .filter((item) => Boolean(item.label))
    .map((item, index) => ({
      icon: PLUGIN_ICON_MAP[item.icon ?? "boxes"] ?? CubeIcon,
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
