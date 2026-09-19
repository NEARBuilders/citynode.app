import type { AnyRoute } from "@tanstack/react-router";
import type { MountId } from "./mount-registry";

export type { MountId };

/**
 * A plugin's ui surface — a single `tree` export of its generated route tree.
 * The mount declaration lives IN the plugin's own routes: any pathless layout
 * root whose id's last segment starts with `_` (e.g. `_public`, `_dashboard`,
 * `_admin`) is a mount declaration. The host derives the mount id from it —
 * no `mounts` map, no name export, no hand-namespaced ids.
 */
export interface UiPluginModule {
  /** host-side identifier (remote name). Used ONLY to namespace internal route ids. */
  name: string;
  /** the plugin's full route tree (generated `routeTree` or code-built `tree`). */
  tree: AnyRoute;
}

export interface ComposedTree {
  routeTree: AnyRoute;
  /** number of subtrees grafted per mount id */
  mountCounts: Record<string, number>;
  /** subtrees grafted per plugin (mount id → count) */
  pluginMounts: Record<string, Record<string, number>>;
  nav: NavManifest;
}

export interface NavItem {
  /** unique item id: `${plugin}__${mount}:${routeId}` */
  id: string;
  /** display label from route staticData.nav.label */
  label: string;
  /** optional icon key (string — host maps icons per shell) */
  icon?: string;
  /** optional nav group (sidebar section) */
  group?: string;
  /** sort order within group, ascending; ties break by label then id */
  order?: number;
  /** absolute URL path the item links to — literal `$param` segments preserved */
  to: string;
  /** plugin the route came from */
  plugin: string;
  /** mount the route grafted under */
  mount: string;
  /** true when hiddenFromNav was set */
  hidden?: never;
}

export interface NavManifest {
  items: NavItem[];
}

export interface NavDeclaration {
  label: string;
  icon?: string;
  group?: string;
  order?: number;
  /** set true to expose the route as a page but omit it from the sidebar */
  hidden?: boolean;
}
