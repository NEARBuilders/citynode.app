# Effect-Native Plugins — Simpler Routers, Handlers, and Merging

> **Status: IMPLEMENTED** on the `orpc-v2` branch. All phases landed; the
> full test matrix is green (the only expected failure is the host
> `runtime-remote` smoke test, which loads old deployed remotes and stays
> red until the atomic `bos publish --deploy`).

Follow-up to [orpc-v2-effect-migration.md](./orpc-v2-effect-migration.md). The
`orpc-v2` branch landed the infrastructure half of that migration (oRPC
2.0.0-beta.35 + Effect 4.0.0-rc.112 via catalog, `errorStatusMap`,
Layer-based scoped `initialize`, v2 middleware, typed error constructors,
RPCLink `origin`/`url` split). This plan covers the remaining handler-idiom
half: Effect-native handlers, Layer-returning `initialize`, cross-plugin
router merging, and removal of the `every-plugin` re-export barrels.

## Problem

`@orpc/experimental-effect` is installed but completely unused. Every plugin
still pays three taxes:

1. **Bridge boilerplate** — handlers are plain async functions calling
   `Effect.runPromise(...)` or per-plugin `runEffect(...)` bridges
   (`plugins/_template/src/lib/context.ts`,
   `packages/every-plugin/src/effect-bridge.ts`) to reach Effect services,
   plus an `extractFromFiberFailure` interceptor in `createRouter`
   (`packages/every-plugin/src/plugin.ts:178`) to unwrap errors.
2. **Deps plumbing** — `initialize` returns a deps record and `createRouter`
   closes over it; services are extracted manually via
   `Layer.buildWithScope` + `Context.get` in every plugin.
3. **Passthrough merging** — the API plugin re-exposes the template plugin's
   routes through 4 one-liner passthrough handlers + re-declared schemas
   (`api/src/index.ts:673-707`), because the plugins map only carries
   client factories, not routers.

## Decisions (resolved)

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Core + barrel removal | Phases 1.3–1.7 + 3.1–3.5 of the parent plan; post-migration renames deferred |
| `createPlugin` vs `definePlugin` | **Hard break `createPlugin`** | `every-plugin` is a Module Federation shared singleton (`packages/every-plugin/src/build/shared-deps.ts:59`) — remote plugins execute the host's copy, so old and new APIs cannot coexist across remotes anyway. The v1→v2 protocol break already forces an atomic redeploy of every remote, so a parallel `definePlugin` would keep legacy paths alive in `every-plugin` while buying nothing. All 5 plugin sources live in this repo and migrate in one PR. |
| Merge shape | **Nested sub-router** | API contract nests the template contract as `things`; client calls become `apiClient.things.createThing`. Kills schema duplication; no flat route-name collisions. |
| Exposure surface | **API-plugin merge** | Merged routes ride the API's router, so OpenAPI at `/api` and MCP pick them up automatically. Per-plugin mounts at `/api/rpc/<key>` stay as-is. |
| Schema library | Stay on Zod | Effect Schema for contracts remains a non-goal (per parent plan). |
| Streaming handlers | Plain async generators | Async-generator handlers cannot be Effect generators. They read services synchronously from the injected Effect Context (Phase 0.2). |

## Goals

1. `initialize` returns a `Layer`; runtime builds it in the plugin scope and
   provides services via `WithEffectContext` (`effect/context` in oRPC context)
2. `createRouter(builder, plugins)` — no deps arg; handlers access services
   via `yield* Tag`
3. Handlers written as `.effect()` generators (or `handlerGen()` fallback) —
   `Effect.fail(new ORPCError(...))` propagates natively, no bridges
4. `plugins` map carries `{ client, router, contract }` per plugin; routers
   merge by nesting, no passthrough handlers or duplicated schemas
5. Delete `every-plugin/orpc`, `every-plugin/effect`, `every-plugin/zod`
   barrels — plugins import `@orpc/*`, `effect`, `zod` directly
6. Remove `shutdown` — Layer finalizers in the plugin scope handle teardown
7. Remove the FiberFailure `onError` interceptor from `createRouter`

## Non-Goals

- Effect Schema for contracts
- `asyncIteratorObject` / `isInferableError` / `RouterContractClient` renames
  (deprecated aliases work — post-migration cleanup)
- Changing the Module Federation architecture or the two-phase host loading
- Changing the client-facing RPC protocol beyond what the parent migration
  already changed

---

## Phase 0 — Spike: verify the Effect integration fits

Half a day of verified assumptions before touching `every-plugin`.

### 0.1 `.effect()` on `implement()` builders

The builder handed to `createRouter` comes from
`implement(contract).$context<…>()`, not `os`. Verify the
`@orpc/experimental-effect/extensions/effect` extension applies to
Implementer procedures. Fallback: the `handlerGen()` wrapper
(`builder.X.handler(handlerGen(function* …))`), which works on any builder.

### 0.2 Streaming handlers read services synchronously

Async-generator handlers cannot `yield*`. Verify plain handlers can read the
injected `effect/context` key, then use:

```typescript
builder.search.handler(async function* ({ input, context }) {
  const publisher = Context.get(context["effect/context"], Publisher);
  for await (const event of publisher.subscribe("thing-updates", { signal })) {
    yield event;
  }
});
```

`Context.get` is synchronous — the built Context is a plain value, no
bridging.

### 0.3 Merged routers in OpenAPI / MCP

Verify `OpenAPIGenerator.generate(apiRouter)` includes routes from an
already-implemented sub-router nested in at runtime (route metadata travels
with procedures). This is what lets the API merge `things: plugins.template.router`
without statically re-declaring schemas. Fallback: nest the contract subtree
statically in the API contract via generated types.

### 0.4 `WithEffectContext` typing

Verify how `$context<AuthContext & WithEffectContext<…>>` composes on the
Implementer, and that runtime-injected `effect/context` satisfies it.

---

## Phase 1 — `every-plugin` core refactor

### 1.1 Pre-load the `.effect` extension

**File:** `packages/every-plugin/src/index.ts`

```typescript
import "@orpc/experimental-effect/extensions/effect";
```

Side-effect import, same pattern as the existing `.route` pre-load in
`src/orpc.ts`. Must run before any plugin evaluates its builder — guaranteed
because `every-plugin` is the plugin factory and an MF singleton.

### 1.2 Restructure `createPlugin` (breaking)

**File:** `packages/every-plugin/src/plugin.ts`

```typescript
type PluginDefinition<V, S, TContract, TRequestContext, P> = {
  variables: V;
  secrets: S;
  context?: TRequestContext;
  contract: TContract;

  initialize?: (
    config: PluginInitializeInput<V, S> & { pluginId: string },
    plugins: P,
  ) => Effect.Effect<Layer.Layer<any, Error>, Error, Scope.Scope | PluginIdTag>;

  createRouter: (
    builder: Implementer<TContract, ContextOutput<TRequestContext>>,
    plugins: P,
  ) => ContractedRouter<TContract, any>;
};
```

- `initialize` returns a `Layer` — no deps record, no `tools`
- `PluginInitializeInput` gains `pluginId: string` (the `bos.config.json` key, the
  same id the host uses for secret injection) — populated in
  `plugin-loader.service.ts`. This is the value plugin-owned db layers use to derive
  their `plugin_<slug>` schema name ([#89 design doc](../v1-current/every-plugin-db-auth-absorption.md),
  D1/D3), so `PluginIdTag` never appears in plugin author code; the tag and its
  `Effect.provideService` stay through a migration window, then drop.
- `createRouter` loses the deps arg; `plugins` becomes the second parameter
- `plugins` map entries change shape: `{ client, router, contract }` instead
  of a bare `ClientFactory`
- `shutdown` removed — Layer finalizers scoped to the plugin handle teardown
- Builder context type merges `WithEffectContext<never>` into the request
  context so `.effect()` handlers typecheck
- Remove the `extractFromFiberFailure` interceptor in `createRouter` —
  `.effect()` handlers propagate `ORPCError` natively. Host-level
  `formatORPCError` logging interceptors stay.

### 1.3 Plugin loader: build the Layer, keep the Context

**File:** `packages/every-plugin/src/runtime/services/plugin-loader.service.ts`
(`initializePlugin`, around line 281)

After `initialize` returns a `Layer`, build it against the plugin's scope and
store the resulting Context:

```typescript
const layer = yield* plugin.initialize(config, plugins);
const effectContext = yield* Layer.buildWithScope(layer, scope);
```

`InitializedPlugin` gains `effectContext`. The existing scope-close cleanup
releases everything — failed initialization closes the scope immediately
(current behavior, unchanged).

### 1.4 `usePlugin`: new `createRouter` signature, inject context into clients

**File:** `packages/every-plugin/src/runtime/index.ts` (line ~178)

- `createRouter(builder, plugins)` — pass the plugins map through
- `createClient` injects `"effect/context": initialized.effectContext` into
  the client context so in-process calls (server-side, SSR) work with
  `.effect()` handlers

---

## Phase 2 — Host wiring

### 2.1 Per-request context injection

**File:** `host/src/routes/api.ts` (`handleOrpc`, line 68)

```typescript
const context = {
  ...buildPluginContext(c),
  "effect/context": effectContextFor(handler),
};
```

- Per-plugin handlers (`/api/rpc/<key>`) get that plugin's `effectContext`
- The base API handler gets `Context.merge(...)` of all initialized plugins —
  merged sub-routers resolve their own services through the same handler.
  Tag IDs are namespaced `<pluginId>/<Service>` (existing convention), so
  merges cannot collide.

### 2.2 Same injection in the dev server

**File:** `packages/every-plugin/src/build/rspack/dev-server-middleware.ts`

### 2.3 SSR client factories

**File:** `host/src/services/plugins.ts` (`createPluginsClient`)

Client factories inject `effect/context` alongside request context.

---

## Phase 3 — Router merging (nested)

### 3.1 Host passes routers and contracts

**File:** `host/src/services/plugins.ts`

The pluginsClient map entries become `{ client, router, contract }`. Routers
already exist on the host plugin entries; contracts on the plugin bindings —
this is plumbing, not new loading.

### 3.2 Generated types

**Files:** `packages/everything-dev/src/` (`bos types gen`)

`PluginsClient` types gain `router` and `contract` per plugin (type-only,
derived from the same local/remote contracts the generator already fetches).
Regenerate `api/src/lib/plugins-types.gen.ts`,
`plugins/*/src/lib/plugins-client.gen.ts`.

### 3.3 API plugin merges instead of passthrough

**Files:** `api/src/index.ts` (delete lines 673–707 passthroughs),
`api/src/contract.ts` (delete re-declared thing schemas)

```typescript
createRouter: (builder, plugins) => ({
  ping: builder.ping.handler(async () => { … }),
  …own routes…,

  things: plugins.template.router,
});
```

- The API contract nests `things` (type-level via generated types; runtime
  nesting of the implemented router — gated on spike 0.3)
- The four `templateClient` null-checks and passthrough handlers are deleted
- OpenAPI at `/api` and `/api/mcp` include the merged routes automatically
- Client calls become `apiClient.things.createThing` — update UI call sites
  (mechanical grep for the four procedure names)

---

## Phase 4 — Migrate the five plugins

### 4.1 `_template` — the reference implementation

**Files:** `plugins/_template/src/index.ts`, `src/service.ts`,
`src/services/things.ts`, `src/lib/context.ts`

- `TemplateService` and the `MemoryPublisher` become `Context.Service` tags
  with Layers (the publisher wraps in `Layer.succeed`)
- `initialize` returns `Layer.mergeAll(...)`; the background fiber moves
  inside a Layer (`Effect.forkScoped` runs within the Layer's scope)
- Handlers → `.effect()` generators; `Effect.fail(new ORPCError(...))` / typed
  `errors.X(...)` fail natively — delete every `runEffect` /
  `Effect.runPromise` call
- Streaming handlers (`search`, `listenBackground`, `subscribeThings`) stay
  async generators using `Context.get(context["effect/context"], Tag)`
- Delete `runEffect` from `src/lib/context.ts`; keep `ContextSchema` (move to
  `src/lib/auth.ts` or keep the file schema-only)
- Drop `status` from contract `.errors()` definitions (already centralized in
  `PLUGIN_ERROR_STATUS_MAP`)

Target shape:

```typescript
initialize: (config) =>
  Effect.succeed(
    Layer.mergeAll(
      TemplateServiceLive(config.variables, config.secrets),
      ThingsService.Live.pipe(
        Layer.provide(DatabaseLive(config.secrets.TEMPLATE_DATABASE_URL)),
      ),
      PublisherLive,
    ),
  ),

createRouter: (builder, plugins) => ({
  getById: builder.getById.effect(function* ({ input, context, errors }) {
    if (!context.userId) {
      yield* Effect.fail(errors.UNAUTHORIZED({ message: "User ID required" }));
    }
    const things = yield* ThingsService;
    return yield* things.getById(input.id);
  }),

  things: plugins.template.router,
}),
```

### 4.2 `apps`, `proposals`, `votes`

Services are already `Context.Service` tags with `.Live` layers —
`initialize` returns the composed Layer directly (drop
`Layer.buildWithScope` + `Context.get` extraction), handlers → `.effect()`
where they currently bridge; plain method-call handlers may stay plain async.

### 4.3 `auth`

Better-Auth handlers are plain async calls — they stay plain. Only the
Effect-service-backed routes migrate. Mostly mechanical.

### 4.4 `api`

Merge per Phase 3.3; handlers using `services.*` (already Effect-backed via
`NodesLive`/`TenantsLive`/`ValidatorsLive`) → `.effect()` with `yield* Tag`.

---

## Phase 5 — Barrel removal + MF shared deps

### 5.1 Delete the re-export barrels

**Files:** `packages/every-plugin/src/orpc.ts`, `src/effect.ts`,
`src/zod.ts`, `package.json` exports

Rewrite imports across `plugins/*`, `api/`, `host/`:

```diff
- import { Context, Effect, Layer } from "every-plugin/effect";
- import { MemoryPublisher, ORPCError, getEventMeta, oc } from "every-plugin/orpc";
- import { z } from "every-plugin/zod";
+ import { Context, Effect, Layer } from "effect";
+ import { ORPCError } from "@orpc/server";
+ import { MemoryPublisher, getEventMeta, oc } from "@orpc/contract";
+ import { z } from "zod";
```

Keep `every-plugin/errors` — the shared error schemas and
`PLUGIN_ERROR_STATUS_MAP` are real abstractions.

### 5.2 Extend MF shared singletons

**File:** `packages/every-plugin/src/build/shared-deps.ts`

Add `@orpc/openapi`, `@orpc/experimental-effect`, `@orpc/publisher` so the
extension patches apply once across remotes and plugins don't bundle their
own copies (parent plan Phase 7). Keep the prerelease-preserving
`requiredVersion` logic.

---

## Phase 6 — Tests, types, docs

- **Unit** (`packages/every-plugin/tests/unit/scope-lifecycle.test.ts`):
  Layer-returning initialize lifecycle, `effect/context` provision, scope
  close releases services
- **Integration** (`packages/every-plugin/tests/integration/`): routers
  created via new signature, merged-router calls, error propagation from
  `.effect()` handlers
- **Regression**: plugin routes respond, streaming endpoints produce events,
  OpenAPI docs at `/api` include merged routes, MCP tools include them
- `bos types gen` regenerate; `bun run test`; `bun typecheck`; `bun lint`;
  `bun run dev` smoke
- Update AGENTS.md's "Scoped resources" paragraph — initialize returns
  Layers now; `Layer.buildWithScope` in plugin code is gone
- Fold a changeset into the existing major orpc-v2 changeset
  (`.changeset/effect4-orpc-v2-migration.md`) — same atomic-deploy constraint
- Upstream note: `_template/src/lib/context.ts` is `bos sync`-managed — the
  deletion must land in nearbuilders/everything-dev so child repos sync
  cleanly

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| `.effect()` unavailable on `implement()` builders | Medium | Spike 0.1; `handlerGen()` fallback works on any builder |
| OpenAPI/MCP misses runtime-nested sub-routers | Medium | Spike 0.3; static contract nesting fallback |
| Experimental package churn (beta.35 → GA renames) | Medium | Catalog-pinned; import paths isolated to `every-plugin` (pre-load) and plugin index files |
| MF singleton: host upgrade instantly breaks un-migrated remote plugins | High | Already accepted by the parent migration — atomic deploy of host + all remotes is the declared plan |
| Streaming handlers regress | Low | Stay async generators; only service access changes (sync `Context.get`) |
| UI call sites for merged `things` routes | Low | Mechanical rename of four procedure paths |

## What Does NOT Change

- Contract file structure and `oc.route({ method, path })` syntax
- Per-plugin public mounts at `/api/rpc/<key>`
- Two-phase host loading and the plugins dependency DAG
- `bos dev` / `bos publish` / `bos types gen` CLI surface
- Zod as the contract schema library
- The request-context shape (`AuthContext`) — `effect/context` is additive

## Execution Order

| Phase | Title | Effort | Depends on |
|---|---|---|---|
| 0 | Spike: verify Effect integration fit | S | — |
| 1 | `every-plugin` core refactor | L | 0 |
| 2 | Host wiring | M | 1 |
| 4 | Migrate the five plugins (`_template` first as reference) | M | 1, 2 |
| 3 | Router merging | M | 1, 4 |
| 5 | Barrel removal + MF shares | S–M | 1 |
| 6 | Tests, types, docs | M | all |

Phase 1 is the critical path. `_template` migrates before the API merge so
the API has a reference router to nest. Work continues on the `orpc-v2`
branch; deploy is atomic with the parent migration (one breaking event, not
two).
