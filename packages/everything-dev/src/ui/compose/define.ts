import type { AnyRoute } from "@tanstack/react-router";
import { declaredSegment, MOUNTS, type MountId, type MutableRoute } from "./mount-registry";
import type { UiPluginModule } from "./types";

export interface UiPluginDefinition {
  name: string;
  /** Mounts this plugin declares. Every `_`-root of the tree must resolve to one of them. */
  mounts: readonly MountId[];
  tree: AnyRoute;
}

/**
 * Declared-mount associations for modules produced by `defineUiPlugin`:
 * module → root child → resolved canonical mount. `composeApp` consults this
 * instead of re-deriving mounts from route ids; raw tree objects keep the
 * derivation fallback.
 */
const declaredMounts = new WeakMap<UiPluginModule, ReadonlyMap<AnyRoute, MountId>>();

export function declaredMountsOf(
  plugin: UiPluginModule,
): ReadonlyMap<AnyRoute, MountId> | undefined {
  return declaredMounts.get(plugin);
}

function closestMount(segment: string): string | undefined {
  const bare = segment.slice(1);
  let best: { id: MountId; distance: number } | undefined;
  for (const id of MOUNTS) {
    const distance = editDistance(bare, id);
    if (distance <= 2 && (!best || distance < best.distance)) best = { id, distance };
  }
  return best?.id;
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let i = 1; i <= b.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= a.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (b[i - 1] === a[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[a.length]!;
}

function validateDefinition(def: UiPluginDefinition): Map<AnyRoute, MountId> {
  for (const mount of def.mounts) {
    if (!MOUNTS.includes(mount)) {
      throw new Error(
        `ui plugin "${def.name}": unknown mount "${String(mount)}". Valid mounts: ${MOUNTS.join(", ")}.`,
      );
    }
  }

  const byChild = new Map<AnyRoute, MountId>();
  const declared = new Set<MountId>(def.mounts);
  const children = ((def.tree as MutableRoute)?.children ?? []) as AnyRoute[];
  for (const child of children) {
    const decl = declaredSegment(child);
    if (!decl) continue;
    if (!decl.mount) {
      const hint = closestMount(decl.segment);
      throw new Error(
        `ui plugin "${def.name}": root route "${decl.segment}" is not a registered mount${hint ? ` (did you mean "_${hint}"?)` : ""}. Registered mounts: ${MOUNTS.map((m) => `_${m}`).join(", ")}.`,
      );
    }
    if (!declared.has(decl.mount)) {
      throw new Error(
        `ui plugin "${def.name}": root route "${decl.segment}" declares mount "${decl.mount}", which is not in the plugin's declared mounts (${[...declared].join(", ") || "none"}). Add "${decl.mount}" to "mounts" or remove the route.`,
      );
    }
    byChild.set(child, decl.mount);
  }
  return byChild;
}

/**
 * Declare a ui plugin surface with a typed mount contract. `mounts` is
 * compile-time checked against the canonical `MountId` union, and the tree is
 * validated at construction: every root child that declares a `_<mount>` must
 * resolve to a declared canonical mount — typos and undeclared mounts throw
 * here instead of silently never grafting. Root children that are not mount
 * declarations (no `_` segment) are allowed and simply never graft.
 */
export function defineUiPlugin<const D extends UiPluginDefinition>(def: D): UiPluginModule {
  const byChild = validateDefinition(def);
  const mod: UiPluginModule = { name: def.name, tree: def.tree };
  declaredMounts.set(mod, byChild);
  return mod;
}
