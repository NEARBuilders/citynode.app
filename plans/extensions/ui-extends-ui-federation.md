# UI-Extends-UI Federation Composition

## Problem

The `extends` chain in `bos.config.json` lets a child config inherit API,
auth, and plugin URLs from a parent runtime. But **UI composition is
all-or-nothing**: a child can only swap the *entire* UI bundle
(`app.ui.production`), not inherit individual routes, components, or
layout subtrees from a parent UI.

This means a tenant or child project that wants the parent's login page,
settings flow, or authenticated layout must either:

1. Copy the route files into its own UI (diverges immediately, breaks "stays
   updated")
2. Replace the entire UI (loses any local customizations)
3. Not customize the UI at all

There is no way to say "I want everything from the parent UI except my own
`/billing` route and a custom `/login`." The architecture lacks the
fine-grained composition that config-level `extends` already provides for
plugins and API.

## Goal

Enable **UI-to-UI composition through `extends`** — a child UI inherits
routes, components, and entire subtrees from a parent UI, loaded at runtime
via Module Federation. The developer experience is as natural as file-based
routing:

- Write local route files — unchanged
- Declare inheritance in `bos.config.json` — which routes/subtrees to inherit
- Override by file presence — a local file at the same path shadows the
  inherited route, no config needed
- Use parent components directly — `import { LoginPanel } from "parent-ui/..."`
- Stay updated — when the parent publishes a new version, children inherit the
  new routes automatically via config-driven URL resolution

This enables different Cloudflare Pages deployments (or any CDN) to share
federated UI components and routes through the same `extends` lineage that
already drives API, auth, and plugin composition.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Transport | MF 2.0 runtime API (dynamic remotes) | One transport for server and browser. The host already uses `createInstance`/`loadRemote` server-side (`federation.server.ts:129-142`). The browser version uses the same pattern — no new mechanism to learn. |
| Shared dep safety | Catalog-enforced `strictVersion: true` | The root `package.json` catalog already pins versions as a supply-chain defense. Connecting it to MF's `requiredVersion` with `strictVersion` makes version mismatch a **build error**, eliminating the double-React footgun. |
| Route merging | Runtime composition via `addChildren` + `router.update` | TanStack Router's `routeTree.gen.ts` is per-project. There's no `mergeRouteTrees` primitive. We load parent route definitions via MF, wire them into the local tree at runtime, and call `router.update({ routeTree })`. |
| Route loading | Eager structure, lazy components | Route manifest (path structure) embedded in runtime config by host — available immediately. Route definitions (beforeLoad, loader, search validation) load at compose time. Route components load lazily on first navigation via MF chunks from the parent's CDN. |
| SSR for inherited routes | Deferred (CSR-only initially) | Local routes SSR as normal. Inherited routes render client-side. SSR composition (server-side MF loading in child's server bundle) is a follow-up phase. Many inheritable routes (e.g. `/login`) already have `ssr: false`. |
| Config model | Reuse top-level `extends` | Parent UI URL resolved from the existing extends chain. No separate `ui.extends` field. Consistent with API/auth/plugin inheritance. |
| Overlaps vs routes | Unified — just routes | An "overlap" is just a route with children. Inheriting `/_layout/_authenticated` automatically inherits all its descendants. One concept, one config field. |
| DX | Transparent composition | No composition code in the child UI. The auto-managed `router.tsx` handles everything. Developer writes routes and config. |

## Architecture

```
bos.config.json (child)
  extends: "bos://dev.everything.near/dev.everything.dev"
  app.ui:
    production: "https://cdn.child.com/remoteEntry.js"
    compose:
      inheritRoutes: ["/_layout/_authenticated", "/login", "/about"]
      excludeRoutes: ["/_layout/_authenticated/organizations"]
      inheritComponents: ["LoginPanel", "Sidebar"]
        │
        │  resolveConfigWithExtends → merged config
        │  buildRuntimeConfig → RuntimeConfig.ui.parent
        │    = { name, url, entry, integrity, routes: <route manifest> }
        │
┌───────▼──────────────────────────────────────────────────┐
│  Host (minimal changes)                                    │
│  buildRuntimeClientConfig adds ui.parent to client config  │
│  During SSR, fetches parent UI's route-manifest.json,      │
│  embeds it in window.__RUNTIME_CONFIG__.ui.parent.routes   │
│  Everything else unchanged                                  │
└───────┬──────────────────────────────────────────────────┘
        │  window.__RUNTIME_CONFIG__.ui.parent
        │  = { name, url, entry, integrity, routes: { ... } }
        │
┌───────▼──────────────────────────────────────────────────┐
│  Child UI (MF remote + MF consumer)                        │
│                                                            │
│  Build (rsbuild.config.ts):                                │
│    exposes: ./Router, ./Hydrate, ./components, ...         │
│              + ./routes/** (auto-generated from filesystem)│
│    remotes: NONE (dynamic, resolved at runtime)            │
│    shared: catalog-enforced (strictVersion: true)          │
│                                                            │
│  Runtime (router.tsx — auto-managed):                      │
│    1. Create router with local routeTree (immediate,       │
│       SSR-safe for local routes)                           │
│    2. Read ui.parent from runtime config                   │
│    3. composeParentRoutes():                               │
│       a. Parse route manifest (from runtime config)        │
│       b. Resolve inherited paths (inheritRoutes minus      │
│          excludeRoutes minus local overrides)              │
│       c. Recursively expand subtrees (descendants of       │
│          inherited layout routes)                          │
│       d. Load route modules via MF loadRemote              │
│       e. mergeRoutes(): wire inherited routes into tree    │
│          - rebind getParentRoute to child's routes         │
│          - skip overridden paths (local wins)              │
│          - exclude specified paths                         │
│       f. router.update({ routeTree: composedTree })        │
│    4. Components load lazily on navigation via MF chunks   │
│       from parent's CDN                                    │
│                                                            │
│  Developer writes:                                         │
│    - Local route files (unchanged)                         │
│    - bos.config.json compose config                        │
│    - Override files at same path (automatic)               │
│    - import { X } from parent components (optional)        │
└──────────────────────────────────────────────────────────┘
        │
        │  Parent UI Remote (everything.dev base UI)
        │  Exposes: ./routes/** (one per route file), ./components, ...
        │  Route manifest: route-manifest.json (generated at build time)
        │  Shared: catalog-enforced singletons
        │  MF chunks: served from CDN, loaded lazily
        │
┌───────▼──────────────────────────────────────────────────┐
│  Parent UI (base everything.dev UI)                        │
│  Route files: unchanged (each already exports Route)       │
│  New exposes in rsbuild.config.ts:                         │
│    ./routes/_layout/login → ./src/routes/_layout/login.tsx │
│    ./routes/_layout/_authenticated → ...                   │
│    (auto-generated from filesystem glob)                   │
│  Route manifest: generated by build plugin                 │
│  DTS: enabled for type generation                          │
└──────────────────────────────────────────────────────────┘
```

### How route trees work today

The route tree is built in two layers:

1. **Route definitions** — each file in `routes/` exports
   `Route = createFileRoute("/path")({...options})`. This is the route's
   behavior: component, loader, beforeLoad, search params, ssr flag.

2. **Tree wiring** — `routeTree.gen.ts` (auto-generated by
   `TanStackRouterRspack`) imports all route definitions, calls
   `.update({ getParentRoute: () => parentRoute })` on each, then builds
   the tree bottom-up with `._addFileChildren(children)`.

The critical insight: **route definitions and tree wiring are separate.**
Route files define *what* a route does; the generated code defines *where*
it sits in the tree. This separation makes composition possible — we load
route definitions from a parent and wire them into the child's tree at
runtime.

### The composition model (unified routes)

There is one concept: **routes**. A route that has children is a subtree.
Inheriting a route with children automatically inherits all its
descendants.

The parent UI publishes a **route manifest** — a small JSON structure
describing all routes, their paths, parent relationships, and which MF
expose to load them from:

```json
{
  "routes": {
    "/_layout/login": {
      "expose": "./routes/_layout/login",
      "parent": "/_layout",
      "ssr": false
    },
    "/_layout/_authenticated": {
      "expose": "./routes/_layout/_authenticated",
      "parent": "/_layout",
      "type": "layout"
    },
    "/_layout/_authenticated/home": {
      "expose": "./routes/_layout/_authenticated/home",
      "parent": "/_layout/_authenticated"
    },
    "/_layout/_authenticated/settings": {
      "expose": "./routes/_layout/_authenticated/settings",
      "parent": "/_layout/_authenticated",
      "type": "layout"
    },
    "/_layout/_authenticated/settings/profile": {
      "expose": "./routes/_layout/_authenticated/settings/profile",
      "parent": "/_layout/_authenticated/settings"
    }
  }
}
```

The host embeds this manifest in the runtime config during SSR, so the
route structure is available immediately at hydrate time — no async
fetch needed for the structure, only for route modules on composition.

### Developer experience

| Developer action | How it works |
|---|---|
| Write a local route | Drop file in `routes/` — unchanged |
| Inherit parent routes | Add `compose.inheritRoutes` to `bos.config.json` |
| Inherit a subtree | List the layout route (e.g. `/_layout/_authenticated`) — descendants are implicit |
| Exclude specific inherited routes | Add `compose.excludeRoutes` |
| Override a parent route | Create a local file at the same path — automatic, no config needed |
| Use a parent component | `import { X } from "parent-ui/components"` or via `createUiExtends` API |
| View all routes | `bos routes list` — shows local, inherited, overrides, excluded |
| Type-safe links | Automatic via `bos types gen` (fetches parent route manifest + DTS) |
| Add a new parent route | Publish parent UI — children inherit automatically (if in subtree or listed) |

### `bos routes list` output

```
Local:      /              (ui/src/routes/_layout/index.tsx)
Local:      /about         (ui/src/routes/_layout/about.tsx)
Inherited:  /login         (from parent-ui, ./routes/_layout/login)
Override:   /settings      (local override of parent-ui)
Inherited:  /home          (from parent-ui, subtree: /_layout/_authenticated)
Inherited:  /organizations (from parent-ui, subtree: /_layout/_authenticated)
Excluded:   /admin         (excluded from /_layout/_authenticated subtree)
```

### Composition at runtime

The `router.tsx` (auto-managed by `everything-dev`) handles composition
transparently:

```ts
export function createRouter(opts: CreateRouterOptions) {
  const localTree = routeTree;  // from routeTree.gen.ts — local routes only
  const parentConfig = opts.context.runtimeConfig?.ui?.parent;

  if (!parentConfig) {
    // No parent — existing behavior, unchanged
    return createTanStackRouter({ routeTree: localTree, ... });
  }

  // Create router with local tree first (immediate, SSR-safe)
  const router = createTanStackRouter({ routeTree: localTree, ... });

  // Async: load parent routes and merge
  composeParentRoutes(router, parentConfig, localTree, opts.context)
    .catch((err) => console.error("[ui-extends] Failed to load parent routes:", err));

  return { router, queryClient: opts.context.queryClient };
}
```

The `composeParentRoutes` function:

1. Parse route manifest from `parentConfig.routes` (embedded by host)
2. Resolve inherited paths:
   - Start with `compose.inheritRoutes`
   - Recursively expand descendants of layout routes
   - Remove paths in `compose.excludeRoutes`
   - Remove paths that exist locally (overrides)
3. Load route modules via `createUiExtends` (MF `loadRemote`)
4. `mergeRoutes`: wire inherited routes into subtrees using manifest
   parent-child relationships, rebind `getParentRoute` to child's routes
5. `router.update({ routeTree: composedTree })`

### How inherited routes access context

`createFileRoute("/_layout/login")` creates a route object. When loaded
via MF, this object is a fresh instance — not bound to the parent's root
route. The `getParentRoute` is set later by the composition builder's
`.update()` call. So the route object is portable.

Inherited routes access `context.runtimeConfig`, `context.authClient`,
`context.queryClient` — all of which are the **child's values** (since the
router is created with the child's context). Inherited routes run in the
child's context, using the child's config and clients. They borrow the
route *definition* (component, loader, beforeLoad) from the parent.

The root route's context type (`createRootRouteWithContext<RouterContext>()`)
is compatible because both parent and child use the same `RouterContext`
type (from `@/app`, shared via MF singleton).

### Component-level composition

The parent UI exposes its component barrel (`./components`). The child UI
imports directly:

```tsx
import { LoginPanel } from "parent-ui/components";
```

Or via the `createUiExtends` API for async loading:

```tsx
const parent = getParentUi();
const { LoginPanel, Sidebar } = await parent.components();
```

For static imports, MF's `remotes` config would need to be declared at
build time. For dynamic imports (the default), the `createUiExtends`
factory resolves the parent at runtime from config — no build-time
coupling.

### What the parent UI exposes

Each route file already exports `Route`. No changes needed to individual
route files. The new work is:

1. **Auto-generate route exposes** in `rsbuild.config.ts` from the
   filesystem — one MF expose per route file:

   ```ts
   const routeFiles = glob.sync("src/routes/**/*.tsx", { cwd: __dirname });
   const routeExposes = Object.fromEntries(
     routeFiles.map(file => [
       `./routes/${file.replace(/^src\/routes\//, "").replace(/\.tsx$/, "")}`,
       `./${file}`,
     ])
   );
   ```

2. **Generate route manifest** — a build plugin that outputs
   `route-manifest.json` describing the route structure (paths, parent
   relationships, expose names).

3. **Enable DTS** — `dts: true` in MF config for type generation
   (currently `false`).

### Lazy component loading

When the child calls `loadRemote("parent/routes/_layout/login")`, the
module is loaded from the parent's CDN. The route's `component` is a
`lazyRouteComponent(() => import("./login.component.js"))` — the
component code is a separate chunk on the parent's CDN.

MF handles this automatically: when the module is loaded as a remote,
its internal dynamic imports resolve to the parent's CDN (via
`publicPath: "auto"`). So the component code loads lazily on navigation,
from the parent's CDN. This is automatic — MF's chunk loading respects
the remote's public path.

This means:
- **Route structure** is available immediately (manifest embedded in
  runtime config by host)
- **Route definitions** (beforeLoad, loader, search validation) load at
  compose time — small, fast
- **Route components** load lazily on first navigation — from parent's
  CDN via MF chunks

## Config surface

### `bos.config.json` — child

```jsonc
{
  "extends": "bos://dev.everything.near/dev.everything.dev",
  "account": "pizza.near",
  "domain": "pizza-everything.dev",
  "app": {
    "ui": {
      "production": "https://pizza-ui.pages.cloudflare.com/remoteEntry.js",
      "integrity": "sha384-...",
      "compose": {
        "inheritRoutes": ["/_layout/_authenticated", "/login", "/about"],
        "excludeRoutes": ["/_layout/_authenticated/organizations"],
        "inheritComponents": ["LoginPanel", "Sidebar", "ApiKeyForm"]
      }
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `compose.inheritRoutes` | `string[]` | Route paths to inherit from parent. A layout route inherits all descendants recursively. |
| `compose.excludeRoutes` | `string[]` | Paths to exclude from inherited subtrees. Punches holes in an inherited subtree. |
| `compose.inheritComponents` | `string[]` | Component names to import from parent's `./components` barrel. |

### `RuntimeConfig.ui` — resolved (host-side)

```ts
ui: {
  name: string;
  url: string;
  entry: string;
  source: "local" | "remote";
  integrity?: string;
  ssrUrl?: string;
  ssrIntegrity?: string;
  parent?: {
    name: string;         // MF remote name of parent UI
    url: string;          // CDN base URL
    entry?: string;       // mf-manifest.json URL (optional, defaults to ${url}/mf-manifest.json)
    integrity?: string;   // SRI hash for parent remoteEntry.js
    routes?: RouteManifest; // embedded by host during SSR
  };
}
```

### `ClientRuntimeConfig.ui` — browser-side

```ts
ui: {
  name: string;
  url: string;
  entry: string;
  integrity?: string;
  parent?: {
    name: string;
    url: string;
    entry?: string;
    integrity?: string;
    routes?: RouteManifest;
  };
}
```

## Implementation phases

### Phase 1: Config foundation + catalog enforcement

**Goal:** Resolve parent UI URL from extends chain, enforce shared dep
versions to eliminate double-React.

| File | Change |
|---|---|
| `packages/everything-dev/src/types.ts` | Add `parent` to `RuntimeConfig.ui` (`{ name, url, entry?, integrity?, routes? }`). Add `compose` to `UiConfigSchema` (`{ inheritRoutes?, excludeRoutes?, inheritComponents? }`). Define `RouteManifest` type. |
| `packages/everything-dev/src/config.ts` | In `buildRuntimeConfig` (~L786), walk extends chain to find nearest ancestor with `app.ui.production`. Populate `ui.parent` with `{ name, url, entry, integrity }`. Do not populate `routes` here — that's the host's job (Phase 3). |
| `ui/rsbuild.config.ts` | Change `SHARE_DEFAULTS` to `strictVersion: true` and `requiredVersion: getInstalledVersion(...)`. This makes version mismatch a build error. Both parent and child UIs resolve from the same root catalog, so versions always match. |
| `packages/everything-dev/src/shared-deps.ts` | Extend `syncResolvedSharedDeps` to emit MF shared config from catalog. This reduces the 6 hand-maintained shared-dep definition sites to one generated source. |
| `host/src/program.ts` | In `buildRuntimeClientConfig` (~L162), add `parent` to the `ui` block in client config. Pass through `name`, `url`, `entry`, `integrity` (routes added in Phase 3). |

**Validation:**
- A child config with `extends` resolves `ui.parent.url` correctly in
  `buildRuntimeConfig`.
- `window.__RUNTIME_CONFIG__.ui.parent` is present in the browser.
- Shared dep version mismatch throws at build time, not runtime.
- Existing UI with no parent works unchanged (no `parent` field).

### Phase 2: Parent UI exports

**Goal:** Parent UI exposes route definitions and a route manifest.

| File | Change |
|---|---|
| `ui/rsbuild.config.ts` | Auto-generate route exposes from filesystem glob. Add them to the existing `exposes` map. Each route file becomes `./routes/<path>` → `./src/routes/<path>.tsx`. |
| `ui/rsbuild.config.ts` | Enable `dts: true` in `pluginModuleFederation` config (currently `false`). MF 2.0's DTS plugin generates type declarations for exposed modules. |
| `packages/everything-dev/src/router-manifest.ts` | New build plugin. Runs after `TanStackRouterRspack` generates `routeTree.gen.ts`. Parses the generated tree to extract path → expose → parent relationships. Outputs `route-manifest.json` to `dist/`. |
| `ui/rsbuild.config.ts` | Wire the route manifest plugin into the build. |

**Route manifest format** (`ui/dist/route-manifest.json`):
```json
{
  "routes": {
    "/_layout/login": {
      "expose": "./routes/_layout/login",
      "parent": "/_layout",
      "ssr": false
    },
    "/_layout/_authenticated": {
      "expose": "./routes/_layout/_authenticated",
      "parent": "/_layout",
      "type": "layout"
    },
    "/_layout/_authenticated/home": {
      "expose": "./routes/_layout/_authenticated/home",
      "parent": "/_layout/_authenticated"
    },
    "/_layout/_authenticated/settings": {
      "expose": "./routes/_layout/_authenticated/settings",
      "parent": "/_layout/_authenticated",
      "type": "layout"
    },
    "/_layout/_authenticated/settings/profile": {
      "expose": "./routes/_layout/_authenticated/settings/profile",
      "parent": "/_layout/_authenticated/settings"
    }
  }
}
```

**Validation:**
- Parent UI build produces `route-manifest.json` alongside
  `mf-manifest.json`.
- All route exposes are loadable via MF `loadRemote`.
- DTS type declarations are generated for each expose.

### Phase 3: Host route manifest embedding

**Goal:** Host fetches parent UI's route manifest during SSR and embeds it
in client config.

| File | Change |
|---|---|
| `host/src/services/federation.server.ts` | Add `loadRouteManifest(parentUrl, integrity?)` helper. Fetches `${parentUrl}/route-manifest.json`, verifies integrity if provided, caches with same TTL/LRU pattern as `routerModuleCache`. |
| `host/src/program.ts` | In `buildRuntimeClientConfig`, when `ui.parent` exists, call `loadRouteManifest(parent.url, parent.integrity)` and embed the result as `ui.parent.routes`. |

**Validation:**
- Client receives `window.__RUNTIME_CONFIG__.ui.parent.routes` containing
  the full route manifest.
- Manifest is cached server-side; repeated requests don't re-fetch.
- Integrity verification rejects tampered manifests.

### Phase 4: The `createUiExtends` interface

**Goal:** Idiomatic API for loading parent UI modules via MF dynamic
remotes.

| File | Change |
|---|---|
| `ui/src/lib/ui-federation.ts` | New. `createUiExtends(parentConfig)` — creates an MF `createInstance` with dynamic remotes (no build-time config). Exposes `components()`, `routes()`, `route(expose)`, `overlap(name)` methods. Each wraps `mf.loadRemote()` with error handling. |
| `ui/src/lib/parent-ui.ts` | New. `getParentUi(runtimeConfig)` — reads `runtimeConfig.ui.parent`, returns a `createUiExtends` instance. Returns `null` if no parent. |

**API:**
```ts
interface UiExtends {
  /** Load the parent's component barrel */
  components(): Promise<Record<string, React.ComponentType>>;
  /** Load a specific route module by expose name */
  route(expose: string): Promise<AnyRoute>;
  /** Load multiple route modules in parallel */
  routes(exposes: string[]): Promise<Record<string, AnyRoute>>;
}

function createUiExtends(parentConfig: {
  name: string;
  url: string;
  entry?: string;
  integrity?: string;
}): UiExtends;
```

**Implementation:**
```ts
import { createInstance } from "@module-federation/enhanced/runtime";

export function createUiExtends(parentConfig) {
  const mf = createInstance({
    name: `ui-consumer-${parentConfig.name}`,
    remotes: [{
      name: parentConfig.name,
      entry: parentConfig.entry ?? `${parentConfig.url}/mf-manifest.json`,
      alias: parentConfig.name,
    }],
    shared: uiSharedDeps,  // same catalog-enforced config
  });

  return {
    async components() {
      const mod = await mf.loadRemote(`${parentConfig.name}/components`);
      return mod as Record<string, React.ComponentType>;
    },
    async route(expose: string) {
      const mod = await mf.loadRemote(`${parentConfig.name}/${expose}`);
      return mod.Route as AnyRoute;
    },
    async routes(exposes: string[]) {
      const entries = await Promise.all(
        exposes.map(async (expose) => [expose, await this.route(expose)] as const)
      );
      return Object.fromEntries(entries);
    },
  };
}
```

**Validation:**
- `createUiExtends` successfully loads parent modules via MF in the
  browser.
- Errors from `loadRemote` are caught and surfaced clearly.
- Multiple calls reuse the same MF instance (no duplicate instances).

### Phase 5: Route composition

**Goal:** Compose local + inherited routes at runtime, transparent to the
developer.

| File | Change |
|---|---|
| `ui/src/lib/compose-routes.ts` | New. Core composition logic: `composeParentRoutes(router, parentConfig, localTree, context)` and `mergeRoutes(...)`. |
| `ui/src/router.tsx` | Add composition: if `ui.parent` exists, call `composeParentRoutes` after creating router with local tree. `router.update({ routeTree })` merges inherited routes. This file is auto-managed by `everything-dev` — the composition code is part of the scaffold. |

**Composition logic:**

```ts
async function composeParentRoutes(router, parentConfig, localTree, context) {
  const parent = createUiExtends(parentConfig);
  const manifest = parentConfig.routes;  // embedded by host
  const composeConfig = context.runtimeConfig.ui.compose;

  // 1. Resolve inherited paths
  const inheritedPaths = resolveInheritedPaths(
    manifest,
    composeConfig.inheritRoutes ?? [],
    composeConfig.excludeRoutes ?? [],
    localTree,  // for override detection
  );

  // 2. Load route modules via MF
  const exposesToLoad = inheritedPaths.map(
    path => manifest.routes[path].expose
  );
  const loadedRoutes = await parent.routes(exposesToLoad);

  // 3. Merge into local tree
  const composedTree = mergeRoutes(localTree, loadedRoutes, manifest, inheritedPaths);

  // 4. Update router
  router.update({ routeTree: composedTree });
}
```

**`resolveInheritedPaths` logic:**

```ts
function resolveInheritedPaths(manifest, inheritRoutes, excludeRoutes, localTree) {
  const localPaths = collectLocalPaths(localTree);  // Set of local route paths
  const result = new Set<string>();

  for (const path of inheritRoutes) {
    // Add the route itself
    if (!localPaths.has(path) && !excludeRoutes.includes(path)) {
      result.add(path);
    }
    // Recursively add descendants
    for (const routePath of Object.keys(manifest.routes)) {
      if (isDescendant(routePath, path) &&
          !localPaths.has(routePath) &&
          !excludeRoutes.includes(routePath)) {
        result.add(routePath);
      }
    }
  }

  return result;
}
```

**`mergeRoutes` logic:**

```ts
function mergeRoutes(localTree, loadedRoutes, manifest, inheritedPaths) {
  // Build a map of inherited routes by path
  const inheritedByPath = new Map<string, AnyRoute>();
  for (const path of inheritedPaths) {
    const expose = manifest.routes[path].expose;
    if (loadedRoutes[expose]) {
      inheritedByPath.set(path, loadedRoutes[expose]);
    }
  }

  // Group inherited routes by parent
  const childrenByParent = new Map<string, AnyRoute[]>();
  for (const [path, route] of inheritedByPath) {
    const parentPath = manifest.routes[path].parent;
    if (!childrenByParent.has(parentPath)) {
      childrenByParent.set(parentPath, []);
    }
    childrenByParent.get(parentPath)!.push(route);
  }

  // For each parent that exists locally, add inherited children to it
  for (const [parentPath, children] of childrenByParent) {
    const parentRoute = findRouteByPath(localTree, parentPath);
    if (parentRoute) {
      // Rebind each child's getParentRoute to the local parent
      for (const child of children) {
        child.update({ getParentRoute: () => parentRoute });
      }
      // Add children to parent
      parentRoute._addFileChildren(
        Object.fromEntries(children.map((c, i) => [`inherited_${i}`, c]))
      );
    }
    // If parent is also inherited, it will be wired when we process its parent
  }

  // Rebuild the tree from root
  return rebuildRouteTree(localTree);
}
```

**Override detection:** `collectLocalPaths(localTree)` builds a Set of all
local route paths from the generated tree. If an inherited route's path is
in this set, it's skipped — the local route wins. For partial subtree
overrides (child has a local file at a path within an inherited subtree),
the local route replaces the inherited one at that position.

**Validation:**
- Child UI inherits `/login` and the `/_layout/_authenticated` subtree
  from parent.
- Navigation to inherited routes works.
- Local file at same path overrides inherited route.
- `excludeRoutes` punches holes in inherited subtrees.
- `router.update({ routeTree })` doesn't flash existing local routes.

### Phase 6: Component composition

**Goal:** Child UI can import parent components directly.

| File | Change |
|---|---|
| `ui/src/lib/ui-federation.ts` | `components()` method already in `createUiExtends` (Phase 4). No new code. |
| Documentation | Document the `import { X } from "parent-ui/components"` pattern and the `createUiExtends().components()` async pattern. |

**Validation:**
- Child UI imports `LoginPanel` from parent and renders it in a local
  route.
- Component singleton sharing works (one React instance).

### Phase 7: Type safety

**Goal:** Inherited routes are type-safe in the child UI.

| File | Change |
|---|---|
| `packages/everything-dev/src/code-artifacts.ts` | Extend `bos types gen` to fetch parent UI's route manifest + MF DTS. Generate ambient type declarations that augment the child's `Register` interface with inherited route types. |
| `ui/src/lib/parent-ui.d.ts` (generated) | Ambient types for inherited routes. Auto-generated by `bos types gen`, gitignored. |

**What gets generated:**

```ts
// ui/src/lib/parent-ui.d.ts (generated)
declare module "@tanstack/react-router" {
  interface Register {
    router: InheritedRouterType;
  }
}

interface InheritedRouterType {
  // Merged from local routeTree + parent route manifest
  // Links to /login, /home, /settings/* type-check correctly
}
```

**Validation:**
- `<Link to="/login" />` in child UI type-checks.
- `useSearch()` on inherited routes is type-safe.
- `useParams()` on inherited dynamic routes is type-safe.
- `bos types gen` regenerates types when parent UI is updated.

### Phase 8: CLI tooling

**Goal:** Developer visibility into composed routes.

| File | Change |
|---|---|
| `packages/everything-dev/src/cli/routes.ts` | New `bos routes list` command. Reads local `routeTree.gen.ts` + parent route manifest (from resolved config). Displays routes with source annotations: Local, Inherited, Override, Excluded. |

**Output:**
```
Local:      /              (ui/src/routes/_layout/index.tsx)
Local:      /about         (ui/src/routes/_layout/about.tsx)
Inherited:  /login         (from parent-ui, ./routes/_layout/login)
Override:   /settings      (local override of parent-ui)
Inherited:  /home          (from parent-ui, subtree: /_layout/_authenticated)
Inherited:  /organizations (from parent-ui, subtree: /_layout/_authenticated)
Excluded:   /admin         (excluded from /_layout/_authenticated subtree)
```

**Validation:**
- `bos routes list` shows correct source annotations.
- Works with no parent (shows all local).
- Works with parent (shows local + inherited + overrides + excluded).

## File change summary

| File | Phase | Type | Lines |
|---|---|---|---|
| `packages/everything-dev/src/types.ts` | 1 | Edit | ~25 |
| `packages/everything-dev/src/config.ts` | 1 | Edit | ~30 |
| `ui/rsbuild.config.ts` | 1, 2 | Edit | ~37 |
| `packages/everything-dev/src/shared-deps.ts` | 1 | Edit | ~40 |
| `host/src/program.ts` | 1, 3 | Edit | ~30 |
| `packages/everything-dev/src/router-manifest.ts` | 2 | New | ~80 |
| `host/src/services/federation.server.ts` | 3 | Edit | ~30 |
| `ui/src/lib/ui-federation.ts` | 4 | New | ~80 |
| `ui/src/lib/parent-ui.ts` | 4 | New | ~15 |
| `ui/src/lib/compose-routes.ts` | 5 | New | ~120 |
| `ui/src/router.tsx` | 5 | Edit | ~25 |
| `packages/everything-dev/src/code-artifacts.ts` | 7 | Edit | ~60 |
| `packages/everything-dev/src/cli/routes.ts` | 8 | New | ~80 |
| **Total** | | | **~652 lines** |

## What does NOT change

- Host SSR loading (`federation.server.ts`) — unchanged for local routes
- Server plugin loading (`plugins.ts`) — unchanged
- Host HTML shell injection — just adds parent URL + manifest to runtime
  config
- Individual route files (`routes/*.tsx`) — unchanged, still export `Route`
- `routeTree.gen.ts` — still generated by `TanStackRouterRspack` for local
  routes
- `hydrate.tsx` — `createRouter` remains synchronous, composition is async
  post-creation
- Testing infrastructure — mock `loadRemote` as already done in
  `packages/every-plugin/src/testing/mocks/module-federation.service.ts`

## Tenant interaction

The composition works alongside the existing tenant model
(`host/src/services/tenant-runtime.ts`):

1. **Tenant per-request UI swap** — `resolveRequestRuntime` can swap the
   entire `app.ui` URL for a tenant. If the tenant's UI also has a
   `parent` (from its own extends chain), the host embeds the parent's
   route manifest too. The tenant's UI composes from its parent.

2. **Tenant extends chain** — a tenant config that `extends` the base
   runtime inherits `app.ui` by default. If the tenant overrides
   `app.ui.production` to point at its own UI, that UI's extends chain
   determines its parent. The host resolves the full chain.

3. **SSR gating** — inherited routes are CSR-only initially. Tenant SSR
   (`isSsrAllowed`) applies to the child UI's local routes as today.
   Inherited routes render client-side regardless.

4. **Integrity verification** — the parent UI's `route-manifest.json`
   should be integrity-verified. The host verifies it against a hash
   published in the parent's `bos.config.json` or derived from the MF
   manifest's integrity.

## Security

### Shared singleton trust model

Module Federation shares React, TanStack Query, and TanStack Router as
singletons across remotes. The catalog-enforced `strictVersion: true`
ensures version match at build time — a compromised parent UI with a
different React version cannot trigger a double-React load (it would
fail the build).

### Supply chain incident response

The existing defense-in-depth applies to UI composition:

1. **Catalog pin protects all remotes** — parent and child resolve from
   the same catalog, so pinning one version secures everything.
2. **Independent deployment enables instant containment** — update the
   compromised parent UI's URL in `bos.config.json` and publish. All
   children inherit the new URL automatically via extends chain
   resolution.
3. **On-chain config is verifiable** — `bos.config.json` is published to
   FastKV. URL changes are inspectable and auditable on-chain.
4. **Runtime isolation limits blast radius** — a compromised parent UI's
   route code runs in the child's browser context. It cannot access the
   child's server secrets or database.

### SRI verification

- Parent UI's `remoteEntry.js` is SRI-verified (existing mechanism in
  `federation.server.ts`).
- Parent UI's `route-manifest.json` should be integrity-verified by the
  host (Phase 3).
- Client-side `loadRemote` does not honor SRI by default. The host
  injects the parent remote entry with an `integrity` attribute in the
  HTML shell (existing pattern for the child UI's remote entry). MF's
  chunk loading from the parent CDN is not SRI-verified — this is a
  known gap. Mitigation: CSP `script-src` with the parent CDN origin,
  or future MF 2.0 SRI support for chunks.

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| MF share scope loads two React copies | High | `strictVersion: true` + `requiredVersion` from catalog — build error on mismatch. Both parent and child resolve from same root catalog. |
| Route objects from parent bound to wrong root | Medium | `update({ getParentRoute })` rebinds in place. Verified that `.update()` modifies the route object. |
| Inherited route's `beforeLoad` accesses context that differs | Low | Context is the child's (created with child's config/clients). Parent route definitions use `context.*` which resolves to child's context — correct behavior. |
| MF chunk loading from parent CDN is slow | Low | Chunks are cached by browser. `defaultPreload: "intent"` preloads on hover. Route manifest available immediately (embedded in config). |
| Route manifest grows large | Low | ~1-5KB for 50 routes. Embedded in runtime config, not a separate fetch. |
| `router.update({ routeTree })` causes flash | Low | Local routes render immediately. Inherited routes show pending component briefly. TanStack Router handles this gracefully. |
| Parent UI route file changes break child | Medium | MF integrity + SRI verification. Parent version pinned in child's resolved config. `bos sync` updates the pin. |
| `dts: true` slows parent UI build | Low | MF 2.0 DTS generation is Rust-based, fast. Can be disabled in dev, enabled for publish. |
| MF runtime in browser (~30KB) | Negligible | React+TanStack is already 200KB+. 30KB is noise. |

## Open questions (deferred)

1. **SSR for inherited routes** — follow-up phase. The child's
   `router.server.tsx` would declare the parent as a server-side MF
   remote and load route modules server-side via
   `@module-federation/node`. Requires the parent UI's server config to
   also expose `./routes/*`. The route manifest would need an `ssr`
   field per route (already included) to guide which routes SSR.

2. **Lazy per-route loading** — currently, all inherited route
   definitions load at compose time (eager structure). For very large
   parent UIs (50+ routes), we could load route definitions lazily
   per-navigation. The manifest (embedded in config) makes this possible
   — the router knows which paths exist, but loads the actual route
   module on first navigation via a `beforeLoad` hook that calls
   `loadRemote` and registers the route dynamically.

3. **Cross-parent composition** — a child extending two parents
   (diamond inheritance). Currently `extends` is a single chain.
   Multi-parent composition would require resolving route conflicts
   between multiple parents. Out of scope.

4. **Hot reload for inherited routes** — during dev, if the parent UI
   changes, the child needs to reload the parent's MF chunks. MF 2.0
   supports dev-time remote HMR, but cross-remote HMR is the weakest
   area. For now, a page refresh reloads parent modules.

5. **`createUiExtends` for static imports** — currently the parent is
   resolved dynamically at runtime (no build-time `remotes` config). For
   static `import { X } from "parent-ui/components"` to work, the child's
   rsbuild config would need a build-time `remotes` entry. This could be
   auto-generated from the resolved config during `bos dev`/`bos build`.
   The dynamic approach (via `createUiExtends().components()`) works
   without build-time config and is the default. Static imports are a
   convenience that could be added later.

## Prototype

A runnable prototype in [beta-v2-override-prototype/](../prototypes/beta-v2-override/)
validates the tenant UI override composition model that this plan builds on —
a host composing base platform remotes alongside tenant-specific override
remotes via Module Federation.

## Relationship to other plans

- **`../beta-v2/tenants.md`** — tenant architecture. UI composition is
  the mechanism by which a tenant overrides individual UI plugins while
  inheriting the rest from the base platform via the extends chain.

- **`../beta-v2/ui.md`** — web plugin architecture. UI-extends-UI
  composition builds on the `composeApp()` grafting model defined there.

- **`./client-runtime-plugins.md`** — client-runtime plugins run
  plugin logic in the browser. UI composition is orthogonal: it's about
  composing UI routes/components, not plugin logic. Both could coexist:
  a client-runtime plugin could provide routes that are inherited by
  child UIs via the composition mechanism described here.
