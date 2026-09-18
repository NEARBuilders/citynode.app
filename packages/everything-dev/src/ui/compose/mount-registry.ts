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

export const MOUNT_REGISTRY: Record<string, MountEntry> = {
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
};
