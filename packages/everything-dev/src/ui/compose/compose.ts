import type { AnyRoute } from "@tanstack/react-router";
import { buildNavManifest } from "./nav";
import { type ComposedTree, MOUNT_ALIASES, type NavManifest, type UiPluginModule } from "./types";

type MutableRoute = AnyRoute & {
  options: { id?: string; getParentRoute?: () => AnyRoute };
  children?: AnyRoute[];
};

function lastSegment(id: string): string {
  return id.split("/").filter(Boolean).at(-1) ?? "";
}

/**
 * Derive the mount id from a plugin subtree root: any pathless layout root
 * whose id's last segment starts with `_` is a mount declaration (e.g.
 * `_public`, `_dashboard`, `_admin`). Unknown `_mount` segments are ignored
 * so plugins can carry internal pathless layouts without accidentally
 * grafting. Aliases (`_auth`) map onto canonical ids.
 */
function deriveMountId(route: AnyRoute): string | undefined {
  const id = (route as MutableRoute).options?.id ?? "";
  const seg = lastSegment(id);
  if (!seg.startsWith("_")) return undefined;
  return MOUNT_ALIASES[seg.slice(1)];
}

/**
 * Find core mount targets: core pathless layout routes whose id's last
 * segment is `_<mount>` — e.g. `/_layout/_public`,
 * `/_layout/_authenticated/_dashboard`. All suffix matches are collected in
 * deterministic pre-order (root-first, then children in declaration order)
 * so grafting picks matches[0] consistently.
 */
export function collectCoreMounts(coreTree: AnyRoute): Map<string, { matches: AnyRoute[] }> {
  const byMount = new Map<string, { matches: AnyRoute[] }>();
  const walk = (route: AnyRoute, depth: number) => {
    const id = (route as MutableRoute).options?.id ?? "/__root__";
    const seg = lastSegment(id);
    if (seg.startsWith("_")) {
      const mount = MOUNT_ALIASES[seg.slice(1)];
      if (mount) {
        const entry = byMount.get(mount);
        if (!entry) byMount.set(mount, { matches: [route] });
        else entry.matches.push(route);
      }
    }
    const children = (route as MutableRoute).children ?? [];
    if (children.length > 0 && depth < 8) {
      for (const child of children) walk(child, depth + 1);
    }
  };
  walk(coreTree, 0);
  return byMount;
}

export interface ComposeResult extends Omit<ComposedTree, "nav"> {
  routeTree: AnyRoute;
  mountCounts: Record<string, number>;
  /** plugin name → mount id → grafted subtree count */
  pluginMounts: Record<string, Record<string, number>>;
  nav: NavManifest;
  warnings: string[];
}

/**
 * Graft plugin route trees into the core (monolith) route tree.
 *
 * Each plugin's opaque tree is walked at ROOT children only: every pathless
 * layout root declaring a `_<mount>` id is a mount declaration and becomes a
 * graft unit. The subtree root id is auto-namespaced to `<plugin>__<mount>`
 * (pathless layouts — ids never touch URLs) and reparented onto the core
 * layout route declaring the same mount; descendants reference the same
 * subtree-root object, so the chain below stays intact — one shallow
 * mutation per subtree, no deep traversal.
 *
 * Plugins graft in ascending-name order, so the client, the server, and
 * tenant hosts compose identical trees: stable first-wins collision winners
 * and no hydration drift.
 *
 * With no grafted subtrees the returned routeTree IS the core tree —
 * monolith-only deployments hydrate the exact tree that SSR'd.
 */
export function composeApp(coreTree: AnyRoute, plugins: readonly UiPluginModule[]): ComposeResult {
  const coreMounts = collectCoreMounts(coreTree);
  const subtreesByMount = new Map<string, MutableRoute[]>();
  const grafts: Array<{ plugin: string; mount: string; subtree: AnyRoute }> = [];

  const sortedPlugins = [...plugins].sort((a, b) => a.name.localeCompare(b.name));
  const mountCounts: Record<string, number> = {};
  const pluginMounts: Record<string, Record<string, number>> = {};

  for (const plugin of sortedPlugins) {
    const children = ((plugin.tree as MutableRoute)?.children ?? []) as MutableRoute[];
    for (const child of children) {
      const mount = deriveMountId(child);
      if (!mount) continue;
      const coreMount = coreMounts.get(mount);
      if (!coreMount) continue;

      const coreRoute = coreMount.matches[0];
      const rootOptions = (child as MutableRoute).options ?? {};
      const namespacedId = `${plugin.name}__${mount}`;
      if (rootOptions.id === namespacedId) continue;
      (child as MutableRoute).options = {
        ...rootOptions,
        id: namespacedId,
        getParentRoute: () => coreRoute,
      };

      let list = subtreesByMount.get(mount);
      if (!list) {
        list = [];
        subtreesByMount.set(mount, list);
      }
      list.push(child as MutableRoute);

      mountCounts[mount] = (mountCounts[mount] ?? 0) + 1;
      pluginMounts[plugin.name] ??= {};
      pluginMounts[plugin.name][mount] = (pluginMounts[plugin.name][mount] ?? 0) + 1;
      grafts.push({ plugin: plugin.name, mount, subtree: child });
    }
  }

  const warnings: string[] = [];
  for (const [mount, subtrees] of subtreesByMount) {
    const coreMount = coreMounts.get(mount)!;
    if (coreMount.matches.length > 1) {
      warnings.push(`multiple core layouts declare mount "_${mount}"; attached to the first`);
    }
    const target = coreMount.matches[0] as MutableRoute;
    const existing = (target.children ?? []) as MutableRoute[];
    const existingIds = new Set(existing.map((sibling) => sibling.options?.id));
    const fresh = subtrees.filter((subtree) => {
      const id = (subtree as MutableRoute).options?.id;
      if (id && existingIds.has(id)) return false;
      return true;
    });
    if (fresh.length > 0) {
      target.children = [...existing, ...fresh];
    }
  }

  const nav: NavManifest = buildNavManifest(grafts);

  return { routeTree: coreTree, mountCounts, pluginMounts, nav, warnings };
}
