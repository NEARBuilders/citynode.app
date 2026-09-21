/**
 * Host-side route-graph construction (ADR 0008 §1): manifests in → host-built
 * tree out. The host constructs ITS OWN Route objects from validated manifest
 * data + generated route-config refs; gates are attached host-side; no
 * foreign route object is ever mutated.
 *
 * The construction code is resolution-agnostic: `PluginResolver` abstracts
 * manifest/route-config loading — disk-resolved (dev / this harness) or
 * MF-resolved (production) — satisfying ADR 0007 §4 dev=prod path shape.
 */
import {
  createRootRoute,
  createRoute,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import {
  MOUNT_REGISTRY,
  type AppDescriptor,
  type PluginManifest,
  type RouteConfigModule,
  type RouteOptionsBundle,
} from "@manifest-compose/shared";

export interface HostContext {
  user?: { id: string; name: string; isAdmin?: boolean };
  org?: { slug: string; member: boolean };
  team?: { id: string; member: boolean };
}

export interface ResolvedPlugin {
  pluginName: string;
  manifest: PluginManifest;
  routeConfig: RouteConfigModule;
}

export type PluginResolver = (entry: {
  pluginName: string;
  source: AppDescriptor["plugins"][string]["source"];
}) => Promise<ResolvedPlugin>;

// ---- gates (host policy; plugins never write auth code for mounts) ----

type GateArgs = { context: HostContext; location: { pathname: string } };

const GATES: Record<string, ((args: GateArgs) => void) | undefined> = {
  none: undefined,
  session: ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/login", search: { redirect: location.pathname } });
  },
  admin: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    if (!context.user.isAdmin) throw redirect({ to: "/" });
  },
  orgMember: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    if (!context.org?.member) throw redirect({ to: "/orgs" });
  },
  teamMember: ({ context }) => {
    if (!context.user) throw redirect({ to: "/login" });
    if (!context.team?.member) throw redirect({ to: "/orgs" });
  },
};

// ---- stable digest over composition inputs ----

export function compositionDigest(app: AppDescriptor, manifests: PluginManifest[]): string {
  const payload = JSON.stringify({
    app: app.name,
    plugins: Object.entries(app.plugins).map(([k, v]) => ({ k, v })),
    manifests,
    mountRegistryVersion: 2,
  });
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  return (((h1 >>> 0) * 4294967296 + (h2 >>> 0)) >>> 0).toString(16);
}

export interface ConstructedTree {
  rootRoute: ReturnType<typeof createRootRoute>;
  digest: string;
  /** Per-plugin manifests in deterministic (name-ascending) order. */
  manifests: PluginManifest[];
}

export async function constructTree(app: AppDescriptor, resolver: PluginResolver): Promise<ConstructedTree> {
  const pluginNames = Object.keys(app.plugins).sort(); // deterministic (C7)
  const resolved: ResolvedPlugin[] = [];
  for (const key of pluginNames) {
    resolved.push(await resolver(app.plugins[key]!));
  }

  const rootRoute = createRootRoute({
    // host owns <html>/<head> chrome; plugin __root head fns are LIFTED here
    head: () => {
      const metas = resolved
        .map((p) => p.routeConfig.rootMeta?.head?.({})?.meta ?? [])
        .flat();
      return { meta: metas };
    },
    component: () => <Outlet />,
  });

  // ---- host-owned mounts (gates only; shape-free) ----
  // A childless pathless layout is a LEAF branch whose full path is "/" — it
  // would compete with real index routes. Mounts exist only when a plugin
  // declares them; unused mounts are simply not constructed.
  const usedMounts = new Set<string>(
    resolved.flatMap((p) => p.manifest.routes.map((r) => r.mount).filter((m): m is string => Boolean(m))),
  );
  const mountRoutes = new Map<string, any>();
  for (const [mountId, def] of Object.entries(MOUNT_REGISTRY)) {
    if (!usedMounts.has(mountId)) continue;
    // pathless mounts take a custom id; parameterized mounts derive their id
    // from their owning path (TanStack forbids both)
    const route = createRoute({
      getParentRoute: () => rootRoute,
      ...(def.parameterized ? { path: def.parameterized.path } : { id: `__mount_${mountId}` }),
      beforeLoad: GATES[def.gate],
      component: () => <Outlet />,
    });
    mountRoutes.set(mountId, route as any);
  }

  // ---- plugin subtrees: fresh constructed routes per composition ----
  const childrenByParent = new Map<any, any[]>();
  const attach = (parent: any, child: any) => {
    let list = childrenByParent.get(parent);
    if (!list) {
      list = [];
      childrenByParent.set(parent, list);
    }
    list.push(child);
  };

  for (const plugin of resolved) {
    // await all per-route option bundles (boot-time config load; per-route
    // chunks resolved through the generated dynamic-import map)
    const optionsById = new Map<string, RouteOptionsBundle>();
    await Promise.all(
      plugin.manifest.routes.map(async (r) => {
        optionsById.set(r.id, await plugin.routeConfig.routeConfigLoaders[r.id]!());
      }),
    );

    interface Node {
      record: (typeof plugin.manifest.routes)[number];
      route: any;
    }
    const byId = new Map<string, Node>();

    // parents before children (constructed with real parent references)
    const pending = [...plugin.manifest.routes];
    const built = new Set<string>();
    let progressed = true;
    while (pending.length > 0 && progressed) {
      progressed = false;
      for (let i = 0; i < pending.length; i++) {
        const record = pending[i]!;
        const parentReady = !record.parentId || byId.has(record.parentId);
        if (!parentReady) continue;
        pending.splice(i, 1);
        progressed = true;

        const opts = optionsById.get(record.id)!;
        // pathed routes derive their id from the path (TanStack forbids both);
        // pathless layouts take a namespaced id for object identity
        const parentRoute: any = record.parentId
          ? byId.get(record.parentId)!.route
          : mountRoutes.get(record.mount!)!;

        const route = record.isLayout
          ? createRoute({
              id: `${plugin.pluginName}__${record.id}`,
              getParentRoute: () => parentRoute,
              component: opts.component ?? (() => <Outlet />),
            })
          : createRoute({
              path: record.path,
              getParentRoute: () => parentRoute,
              ...(opts.loader ? { loader: opts.loader } : {}),
              ...(opts.beforeLoad ? { beforeLoad: opts.beforeLoad } : {}),
              ...(opts.head ? { head: opts.head } : {}),
              ...(opts.staticData ? { staticData: opts.staticData } : {}),
              component: opts.component ?? (() => <Outlet />),
            });

        byId.set(record.id, { record, route });
        built.add(record.id);
        attach(parentRoute, route);
        break;
      }
    }
    if (pending.length > 0) {
      throw new Error(
        `unresolvable parentage in ${plugin.pluginName}: ${pending.map((r) => r.id).join(", ")}`,
      );
    }
  }

  // assemble: parents own their constructed children (public addChildren API
  // on host-owned routes — the entire graft-mutation class never appears)
  for (const [parent, children] of childrenByParent) {
    parent.addChildren(children);
  }
  rootRoute.addChildren([...mountRoutes.values()] as any);

  const manifests = resolved.map((p) => p.manifest);
  return { rootRoute, digest: compositionDigest(app, manifests), manifests };
}
