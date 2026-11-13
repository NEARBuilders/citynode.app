import {
  BankIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  ClipboardTextIcon,
  CoinsIcon,
  CompassIcon,
  CubeIcon,
  GearSixIcon,
  HouseIcon,
  LightningIcon,
  ListChecksIcon,
  NetworkIcon,
  PlusCircleIcon,
  QrCodeIcon,
  RocketLaunchIcon,
  ScrollIcon,
  ShieldIcon,
  SparkleIcon,
  TreeStructureIcon,
  WrenchIcon,
} from "@phosphor-icons/react";
import type { AppTranslator } from "@/i18n/catalogs";
import { translateEnglishAppMessage } from "@/i18n/runtime";

export type SidebarRole = "anon" | "member" | "admin";

export type SidebarSection = "main" | "manage";

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
  slug?: string;
  search?: Record<string, string>;
  exact?: boolean;
  activePrefixes?: string[];
  children?: SidebarItem[];
  section?: SidebarSection;
  group?: string;
  order?: number;
}

export interface NavContext {
  hasOrganization?: boolean;
  canCurate?: boolean;
  isAdmin?: boolean;
}

export function createAdminChildren(t: AppTranslator, context: NavContext = {}): SidebarItem[] {
  return [
    {
      icon: NetworkIcon,
      label: t("common.communities"),
      slug: "admin-nodes",
      to: "/admin/nodes",
      roleRequired: "admin",
    },
    {
      icon: CalendarDotsIcon,
      label: t("events.title"),
      slug: "admin-events",
      to: "/admin/events",
      roleRequired: "admin",
    },
    {
      icon: ClipboardTextIcon,
      label: t("reports.title"),
      slug: "admin-reports",
      to: "/admin/reports",
      roleRequired: "admin",
    },
    {
      icon: ScrollIcon,
      label: t("common.proposals"),
      slug: "admin-proposals",
      to: "/admin/proposals",
      roleRequired: "admin",
    },
    ...(context.canCurate || context.isAdmin
      ? [
          {
            icon: ListChecksIcon,
            label: t("nav.directory"),
            slug: "discover",
            to: "/discover",
            roleRequired: "member" as const,
          },
        ]
      : []),
    {
      icon: WrenchIcon,
      label: t("common.platform"),
      slug: "admin-platform",
      to: "/admin/stations",
      activePrefixes: PLATFORM_PATHS,
      roleRequired: "admin",
      children: [
        {
          icon: QrCodeIcon,
          label: t("org.stations"),
          slug: "admin-stations",
          to: "/admin/stations",
          roleRequired: "admin",
        },
        {
          icon: TreeStructureIcon,
          label: t("nav.sites"),
          slug: "admin-tenants",
          to: "/admin/tenants",
          roleRequired: "admin",
        },
        {
          icon: LightningIcon,
          label: t("nav.relayer"),
          slug: "admin-relayer",
          to: "/admin/relayer",
          roleRequired: "admin",
        },
        {
          icon: GearSixIcon,
          label: t("nav.system"),
          slug: "admin-system",
          to: "/admin/system",
          roleRequired: "admin",
        },
      ],
    },
  ];
}

const PLATFORM_PATHS = ["/admin/stations", "/admin/tenants", "/admin/relayer", "/admin/system"];

export function buildNavItems(
  context: NavContext = {},
  t: AppTranslator = translateEnglishAppMessage,
): SidebarItem[] {
  return [
    {
      icon: HouseIcon,
      label: t("common.home"),
      slug: "dashboard",
      to: "/dashboard",
      exact: true,
      roleRequired: "member",
      section: "main",
    },
    ...(context.hasOrganization === false
      ? context.isAdmin
        ? []
        : [
            {
              icon: RocketLaunchIcon,
              label: t("dashboard.startCommunity"),
              slug: "start-community",
              to: "/apply",
              roleRequired: "member" as const,
              section: "main" as const,
            },
          ]
      : [
          {
            icon: NetworkIcon,
            label: t("nav.myCommunity"),
            slug: "my-node",
            to: "/dashboard/node",
            activePrefixes: ["/dashboard/node", "/nodes/", "/tenant/", "/orgs"],
            roleRequired: "member" as const,
            section: "main" as const,
          },
        ]),
    {
      icon: CompassIcon,
      label: t("common.explore"),
      slug: "explore",
      to: "/explore",
      activePrefixes: ["/explore", "/n/", "/activity/"],
      roleRequired: "anon",
      section: "main",
    },
    {
      icon: CoinsIcon,
      label: t("common.stake"),
      slug: "stake",
      to: "/stake",
      roleRequired: "anon",
      section: "main",
    },
    {
      icon: ShieldIcon,
      label: t("org.admin"),
      slug: "admin",
      to: context.isAdmin ? "/admin/nodes" : "/discover",
      activePrefixes: ["/admin", "/discover"],
      roleRequired: context.canCurate && !context.isAdmin ? "member" : "admin",
      section: "manage",
      children: createAdminChildren(t, context),
    },
  ];
}

export const NAV_ITEMS: SidebarItem[] = buildNavItems({ canCurate: true });

export function isDocsPath(pathname: string) {
  return pathname === "/docs" || pathname.startsWith("/docs/") || pathname === "/skill";
}

export function navSlug(item: Pick<SidebarItem, "slug" | "label">) {
  return item.slug ?? item.label.toLowerCase().replace(/\s+/g, "-");
}

export function isNavItemActive(
  item: Pick<SidebarItem, "to" | "exact" | "activePrefixes" | "search">,
  pathname: string,
  search: Record<string, unknown> = {},
): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (item.search) {
    if (normalized !== item.to) return false;
    const current = typeof search.tab === "string" ? search.tab : undefined;
    const wanted = item.search.tab;
    return current === wanted || (current === undefined && wanted === "events");
  }
  if (normalized === item.to) return true;
  if (item.exact) return false;
  const prefixes = item.activePrefixes ?? [item.to];
  return prefixes.some(
    (prefix) =>
      prefix !== "/" &&
      (normalized === prefix ||
        normalized.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)),
  );
}

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

export interface ManifestRoute {
  id: string;
  parentId?: string;
  path?: string;
  isLayout?: boolean;
  isIndex?: boolean;
}

/**
 * Absolute URL paths a shipped route tree actually serves, from the
 * generated manifest's parent-relative `path` fields (layouts are pathless;
 * parentId chains accumulate; trailing-slash index paths normalize).
 */
export function routePathsFromManifest(routes: ManifestRoute[]): Set<string> {
  const byId = new Map(routes.map((route) => [route.id, route]));
  const absolute = new Map<string, string>();
  const resolve = (route: ManifestRoute): string => {
    const cached = absolute.get(route.id);
    if (cached) return cached;
    let path = route.path ?? "/";
    const parent = route.parentId ? byId.get(route.parentId) : undefined;
    if (parent) {
      const parentPath = resolve(parent);
      if (parentPath !== "/") path = `${parentPath}${path}`;
    }
    const normalized = path.length > 1 ? path.replace(/\/+$/, "") : "/";
    absolute.set(route.id, normalized);
    return normalized;
  };
  return new Set(
    routes
      .filter((route) => !route.isLayout && route.path)
      .map(resolve)
      .filter((p) => p !== "/"),
  );
}

/**
 * Keep only items whose target route shipped. Children are pruned
 * recursively; parents whose children all drop disappear. An empty path set
 * is treated as "route manifest not available yet" and disables filtering.
 */
export function filterSidebarByRoutes(
  items: SidebarItem[],
  paths: ReadonlySet<string>,
): SidebarItem[] {
  if (paths.size === 0) return items;
  const resolves = (item: SidebarItem): boolean =>
    paths.has(item.to) || (item.activePrefixes ?? []).some((prefix) => paths.has(prefix));
  const visible = (item: SidebarItem): SidebarItem | null => {
    if (!resolves(item)) return null;
    if (!item.children) return item;
    const children = item.children
      .map(visible)
      .filter((child): child is SidebarItem => child !== null);
    if (children.length === 0) return null;
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

export function groupSidebarItems(
  items: SidebarItem[],
  t: AppTranslator = translateEnglishAppMessage,
) {
  const sections: Array<{ key: string; label: string | null; items: SidebarItem[] }> = [];
  for (const item of items) {
    const key = item.section ?? item.group ?? "more";
    const label =
      item.section === "manage"
        ? t("nav.manage")
        : item.section === "main"
          ? null
          : (item.group ?? t("common.more"));
    const existing = sections.find((section) => section.key === key);
    if (existing) existing.items.push(item);
    else sections.push({ key, label, items: [item] });
  }
  return sections;
}
