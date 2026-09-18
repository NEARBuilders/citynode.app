import type { AnyRoute } from "@tanstack/react-router";
import type { NavItem, NavManifest } from "./types";

type MutableRoute = AnyRoute & {
  options: {
    id?: string;
    path?: string;
    staticData?: { nav?: Record<string, unknown> };
  };
  children?: AnyRoute[];
};

/**
 * Compute the full URL path of a route by walking up the (possibly
 * reparented) parent chain, concatenating `options.path` segments. `$param`
 * segments are preserved literally. Empty string for pathless routes.
 */
export function routeFullPath(route: AnyRoute): string {
  const segments: string[] = [];
  let current: AnyRoute | undefined = route;
  let depth = 0;
  while (current && depth < 32) {
    const path = (current as MutableRoute).options?.path;
    if (path) segments.unshift(path.replace(/^\/+/, ""));
    current = (current as MutableRoute).options?.getParentRoute?.();
    depth += 1;
  }
  return `/${segments.filter(Boolean).join("/")}`;
}

/**
 * Derive the nav manifest from grafted plugin subtrees. Core routes keep
 * their own nav wiring untouched; only routes inside grafted plugin subtrees
 * declaring `staticData.nav = { label, icon?, group?, order?, hidden? }`
 * contribute items. `id` of each item is `<plugin>__<mount>:<routeId>`.
 */
export function buildNavManifest(
  grafts: Array<{ plugin: string; mount: string; subtree: AnyRoute }>,
): NavManifest {
  const items: NavItem[] = [];
  const walk = (route: AnyRoute, plugin: string, mount: string) => {
    const options = (route as MutableRoute).options;
    const nav = options?.staticData?.nav;
    if (nav && typeof nav === "object" && typeof nav.label === "string") {
      if (nav.hidden !== true) {
        const declared = typeof nav.to === "string" ? (nav.to as string) : undefined;
        const resolved = declared ?? routeFullPath(route);
        items.push({
          id: `${plugin}__${mount}:${options?.id ?? ""}`,
          label: nav.label,
          icon: typeof nav.icon === "string" ? nav.icon : undefined,
          group: typeof nav.group === "string" ? nav.group : undefined,
          order: typeof nav.order === "number" ? nav.order : undefined,
          to: resolved,
          plugin,
          mount,
        });
      }
    }
    const children = (route as MutableRoute).children ?? [];
    for (const child of children) walk(child, plugin, mount);
  };
  for (const graft of grafts) walk(graft.subtree, graft.plugin, graft.mount);
  items.sort(compareNavItems);
  return { items };
}

function compareNavItems(a: NavItem, b: NavItem): number {
  const groupOrder = (a.group ?? "").localeCompare(b.group ?? "");
  if (groupOrder !== 0) return groupOrder;
  if (a.order !== undefined || b.order !== undefined) {
    return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
  }
  const labelOrder = a.label.localeCompare(b.label);
  if (labelOrder !== 0) return labelOrder;
  return a.id.localeCompare(b.id);
}
