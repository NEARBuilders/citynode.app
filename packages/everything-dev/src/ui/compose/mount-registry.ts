import type { AnyRoute } from "@tanstack/react-router";

/**
 * Mount registry — data describing each canonical mount id. Mounts are
 * declared by core pathless layouts (`_public`, `_authenticated`, …) and honored
 * at plugin boundary via `_<mount>` subtree roots. The registry only records
 * semantics; gates and shells live in the core tree.
 */
export interface MountEntry {
  id: string;
  /** how the mount restricts sessions */
  gate: "none" | "reject-authed" | "session" | "admin" | "organization";
  /** shell the core renders for routes under this mount (or none today) */
  shell?: "dashboard";
  /** url footprint: pathless or parameterized */
  url: "pathless" | "parameterized";
  /** proper name surfaced in tooling output */
  label: string;
}

export const MOUNT_REGISTRY = {
  public: { id: "public", gate: "none", url: "pathless", label: "public" },
  anon: { id: "anon", gate: "reject-authed", url: "pathless", label: "anonymous" },
  authenticated: { id: "authenticated", gate: "session", url: "pathless", label: "authenticated" },
  dashboard: {
    id: "dashboard",
    gate: "session",
    shell: "dashboard",
    url: "pathless",
    label: "dashboard",
  },
  admin: { id: "admin", gate: "admin", shell: "dashboard", url: "pathless", label: "admin" },
  organization: {
    id: "organization",
    gate: "organization",
    shell: "dashboard",
    url: "parameterized",
    label: "organization",
  },
} satisfies Record<string, MountEntry>;

/**
 * Canonical mount ids — the compat contract between core trees and plugin
 * trees. Derived from `MOUNT_REGISTRY` so the registry is the single source
 * of truth; versioned deliberately via `MOUNT_REGISTRY_VERSION`.
 */
export type MountId = keyof typeof MOUNT_REGISTRY & string;

export const MOUNTS: readonly MountId[] = Object.keys(MOUNT_REGISTRY) as readonly MountId[];

/**
 * Mount aliases accepted at the plugin boundary. Plugin authors write
 * `_<mount>` pathless layout roots; aliases map onto canonical ids so legacy
 * naming (like the prototype's `_auth`) still grafts deterministically.
 */
export const MOUNT_ALIASES: Record<string, MountId> = {
  auth: "authenticated",
  authed: "authenticated",
  authenticated: "authenticated",
  public: "public",
  anon: "anon",
  admin: "admin",
  dashboard: "dashboard",
  organization: "organization",
};

export type MutableRoute = AnyRoute & {
  options: { id?: string; getParentRoute?: () => AnyRoute };
  children?: AnyRoute[];
};

export function lastSegment(id: string): string {
  return id.split("/").filter(Boolean).at(-1) ?? "";
}

/**
 * Derive the mount id from a plugin subtree root: any pathless layout root
 * whose id's last segment starts with `_` is a mount declaration (e.g.
 * `_public`, `_dashboard`, `_admin`). Unknown `_mount` segments are ignored
 * so raw plugin trees (not produced by `defineUiPlugin`) can carry internal
 * pathless layouts without accidentally grafting — `composeApp` uses this
 * only as the raw-tree fallback; `defineUiPlugin` modules validate instead.
 */
export function deriveMountId(route: AnyRoute): MountId | undefined {
  return declaredSegment(route)?.mount;
}

/**
 * Detect a mount declaration on a route root without resolving it: returns
 * the raw `_segment` plus its canonical mount (undefined when the segment is
 * not a registered mount or alias) — or undefined when the route is not a
 * mount declaration at all.
 */
export function declaredSegment(
  route: AnyRoute,
): { segment: string; mount: MountId | undefined } | undefined {
  const id = (route as MutableRoute).options?.id ?? "";
  const seg = lastSegment(id);
  if (!seg.startsWith("_")) return undefined;
  return { segment: seg, mount: MOUNT_ALIASES[seg.slice(1)] };
}
