# every-plugin/db + every-plugin/auth: absorbing per-plugin boilerplate

> Ticket: [#89](https://github.com/NEARBuilders/citynode.app/issues/89) (design spike)
> Status: DECIDED — prototype at [plans/prototypes/db-auth-absorption/](../prototypes/db-auth-absorption/), build plans 017–019 in [advisor-plans/](../../advisor-plans/)
> Origin: post-migration improvement survey (2026-09-15), finding DIR-01 / A6

## Problem

A minimal DB-backed plugin carries ~250 lines of framework plumbing copied from
`_template` and maintained by `bos sync` overwriting local edits:

- A private `db/layer.ts` copied across `api/src/db/layer.ts` and
  `plugins/{proposals,votes,_template,auth}/src/db/layer.ts` — near-identical with drift:
  proposals/votes carry a vestigial `pluginId === "api" ? undefined : …` special case
  (dead code — they are never `api`), and three different plugin-id→slug normalizers exist
  (`_template`'s private `normalizeSlug`, `everything-dev/db`'s `pluginMigrationSlug`,
  `every-plugin`'s `getNormalizedRemoteName`).
- A 44-line `lib/context.ts` local copy in 4 workspaces (api already re-exports from
  `every-plugin`).
- A ~150–266-line `lib/auth.ts` per workspace (converged in api/proposals/votes; stale in
  `_template`/apps).
- The scoped-layer incantation (`Layer.buildWithScope(layer, yield* Effect.scope())`)
  hand-copied at 7 call sites (advisor-plan 001).
- `PluginIdTag` leaking into every plugin author's `initialize` signature and unit tests,
  even though the framework injects it at
  `packages/every-plugin/src/runtime/services/plugin-loader.service.ts:284`.

The framework already owns every ingredient: it injects `PluginIdTag`, it owns migration
tooling (`everything-dev/db`), and it demonstrates the facade subpath pattern
(`every-plugin/effect`, `/orpc`, `/zod`).

## Goal

A fresh DB-backed plugin is **contract + service + index** (+ `schema.ts` and
`migrations/`). Everything else — driver selection, connection pooling, schema isolation,
migration running, auth middleware, Effect bridging — comes from two new facades:

- `every-plugin/db` — `DatabaseLive`, `DatabaseTag`, driver creation, slug/schema helpers,
  and the migration runner.
- `every-plugin/auth` — the converged `createAuthMiddleware` machinery, generic over the
  per-workspace generated auth context types.

## Decisions (spike questions settled)

### D1 — Canonical slug semantics

`everything-dev/db`'s `pluginMigrationSlug` (backed by its `normalizeSlug`) is canonical.
It is already consumed by 4 of 5 db-layer copies, the CLI (`db-doctor`, `db-studio`), the
host's DB bindings resolution, and `drizzle.config.ts` identity. `_template`'s private
`normalizeSlug` is the drift and is deleted.

Schema-name rules going forward:

- Every workspace on the **shared API database** (api_db) uses an unconditional
  `plugin_<slug>` schema — including `api` itself (`plugin_api`). The
  `pluginId === "api" ? undefined : …` special case in proposals/votes is dead code (those
  plugins are never id `api`); deleting it changes nothing at runtime, so **no data
  migration is required** — schemas and journal tables already live at
  `plugin_<slug>`/`drizzle.__drizzle_migrations`.
- A workspace on a **dedicated database** (auth on auth_db) may opt out of schema
  isolation (`DatabaseLive(url, { schema: false })`) and runs in `public`, as the auth
  plugin does today.

### D2 — Where the drivers live

`pg` and `@electric-sql/pglite` stay **out** of the Module Federation singleton share set
and out of static `every-plugin` imports. `every-plugin/db` selects drivers via dynamic
`import()` exactly like today's per-plugin `db/index.ts`; plugins keep declaring the
drivers in their own `package.json`, and the rspack `externals: ["pg",
"@electric-sql/pglite"]` convention is unchanged.

Rationale: adding the drivers (or `drizzle-orm`) to the shared set would grow the
singleton trust surface (see AGENTS.md "Shared Singleton Trust Model") and change every
remote's bundle. Keeping them externalized means the absorbed facade costs the shared
package only a few hundred lines of orchestration code. Consequence for the facade:
`drizzle-orm` may only appear as `import type` — runtime values (e.g. the `pg`/
`drizzle-orm/node-postgres` constructors) arrive via dynamic import and generics.

This also decides the leftover from advisor-plan 010: the shared-dep list is unchanged by
this design.

### D3 — Where the migration tooling lives

The runtime-needed pieces — `normalizeSlug`, `pluginMigrationSlug`,
`getMigrationStorage`, and the migration runner that advisor-plan 008 consolidates —
**move into `every-plugin/db`**. `everything-dev/db` re-exports them for one release
cycle so existing child repos' `db/layer.ts` copies and `drizzle.config.ts` files keep
compiling until `bos sync` delivers the thin re-export shims, then drops the re-exports
and keeps only CLI-side tooling (`workspaceIdentityFromModuleUrl`, drizzle-kit helpers,
host-side bindings).

Rationale: runtime plugin code should import runtime primitives from the runtime package
(`every-plugin` is already the MF-shared import every plugin makes); `everything-dev` is
the CLI/scaffolding package. Today's `api/src/db/layer.ts` importing `everything-dev/db`
at runtime only works because everything-dev happens to be resolvable on the host — that
coupling goes away.

### D4 — What `bos sync` owns afterward

The per-plugin derived-files list shrinks. After migration:

- `plugins/<key>/src/db/layer.ts`, `db/index.ts`, `db/migrate.ts` → deleted (or, for one
  sync cycle, a 1-line re-export from `every-plugin/db` so sync's three-way merge has a
  clean baseline).
- `plugins/<key>/src/lib/context.ts` → deleted (re-export from `every-plugin` already
  exists as the target shape; advisor-plan 002 is subsumed).
- `plugins/<key>/src/lib/auth.ts` → thin typed re-export from `every-plugin/auth` (the
  generic parameters and generated-type imports stay per-workspace).
- `FRAMEWORK_OWNED_SYNC_FILES` and the per-plugin derived list in
  `packages/everything-dev/src/cli/sync.ts` shrink accordingly; files that no longer
  exist upstream are treated as removed (existing sync behavior for deleted template
  files).

A fresh plugin's sync-owned surface becomes: `rspack.config.js`, `drizzle.config.ts`,
`tsconfig*.json`, `tests/types.d.ts`, `src/global.d.ts`, and the thin `lib/auth.ts`
re-export — the `db/` directory and `lib/context.ts` disappear from the child entirely.

## API surface

### `every-plugin/db`

```ts
import { Context, Effect, Layer } from "every-plugin/effect";
import type { PgDatabase, PgQueryResultHKT, PgSchema } from "drizzle-orm/pg-core";

export class DatabaseError extends Data.TaggedError("DatabaseError")<{ cause: unknown }> {}

export const DatabaseService = Context.Service<DatabaseService, PgDatabase<PgQueryResultHKT, any>>()(
  "every-plugin/Database",
);

export interface DatabaseLiveOptions<TSchema extends PgSchema | undefined> {
  pluginId: string;                                    // from PluginInitializeInput
  schema?: TSchema;
  schemaIsolation?: boolean;                           // false → public (auth-style dedicated DB)
  migrations?: Array<{ sql: string; journal: string }>; // virtual-module or disk-loaded
}

export function DatabaseLive<TSchema extends PgSchema | undefined = undefined>(
  url: string,
  options: DatabaseLiveOptions<TSchema>,
): Layer.Layer<DatabaseService, DatabaseError, Scope.Scope>;

export function pluginSchemaName(pluginId: string): string;   // `plugin_${pluginMigrationSlug(pluginId)}`
export { pluginMigrationSlug, getMigrationStorage } from "./slug";  // moved from everything-dev/db
export function createDatabaseDriver(url: string, schemaName?: string): Promise<Driver>;  // dynamic pg/pglite
export function runMigrations(driver: Driver, migrations: Migration[], opts?): Promise<MigrationReport>;
```

Design notes validated by the prototype:

- **`PluginIdTag` disappears from plugin-author code.** Effect 4 removed `FiberRef`, so
  ambient injection is off the table; instead the plugin loader adds `pluginId: string`
  to `PluginInitializeInput` (it already passes `variables`/`secrets`), and
  `DatabaseLive(url, { pluginId, … })` closes over it. The public `initialize` type
  narrows to `Effect<TDeps, Error, Scope.Scope>`. `Effect.provideService(PluginIdTag, …)`
  stays in the loader through the migration window for plugins still yielding
  `PluginIdTag`; the accepted input type keeps the `| PluginIdTag` union until plan 019
  drops it.
- **One tag id, per-plugin instances.** `DatabaseService` uses a single
  `"every-plugin/Database"` id. Two plugins never share an Effect scope (the loader
  builds each plugin's services in its own scope; cross-plugin composition goes through
  `pluginsClient`, not merged contexts), so one shared tag identity is safe and is
  precisely what makes the facade absorbable.
- **`buildScoped`** (advisor-plan 001) lands as `every-plugin` root exports
  (`buildScopedContext`, `buildScoped`); `DatabaseLive` composes with it, and plan 001's
  `PluginEnv` alias is superseded by `Scope.Scope`.

### `every-plugin/auth`

```ts
import type { z } from "every-plugin/zod";

export interface AuthContextShape {
  userId?: string;
  user?: unknown;
  apiKey?: unknown;
  organization?: unknown;
  session?: unknown;
}

export function createAuthMiddleware<TAuthContext extends AuthContextShape = AuthContextShape>(
  builder: any,
  options?: { orgMetaSchema?: z.ZodType },
): {
  requireAuth: …; requireAuthOrApiKey: …; requireRole: …;
  requireAdmin: …; requireOrganization: …; requireOrgRole: …; requireApiKey: …;
};
```

The converged 266-line `api/src/lib/auth.ts` machinery moves in, generic over the
workspace's context type. The per-workspace `lib/auth.ts` shrinks to ~10 lines:

```ts
import { createAuthMiddleware } from "every-plugin/auth";
import type { AuthPluginContext } from "./auth-types.gen";

export const { requireAuth, requireOrganization, … } = createAuthMiddleware<AuthPluginContext>;
```

`auth-types.gen.ts` stays per-workspace (it is generated from the deployed auth plugin
manifest by `bos types gen` — the facade cannot own it).

## Workspace migration plan

Order (each step independently shippable; advisor-plans 017–019):

1. **017 — facades land.** `every-plugin/db` + `every-plugin/auth` subpath exports, the
   `pluginId: string` addition to `PluginInitializeInput` in
   `plugin-loader.service.ts`, `buildScoped` in the root export, and
   `everything-dev/db` re-exports. `_template` rebuilt on the facades — the
   template's two migration pipelines (virtual-module bundled vs disk-loaded) are
   reconciled by adopting `_template`'s virtual-module pipeline (`virtual:drizzle-migrations.sql`
   via the rspack `DrizzleORMMigrations()` plugin) as the default; disk-loaded
   `migrations/` remains supported via `DatabaseLive` options for the existing
   workspaces.
2. **018 — workspaces migrate.** api, proposals, votes (delete the dead `api`
   special-case, adopt the shared runner — which also delivers advisor-plan 008's
   SAVEPOINT fix for the proposals/votes 25P02 bug), auth (schema-less mode), apps
   (lib only). Each workspace's `db/` and `lib/context.ts` shrink to re-exports or
   vanish; behavior is identical (same slugs, same journal tables, same URLs).
3. **019 — sync + scaffold cutover.** `FRAMEWORK_OWNED_SYNC_FILES` / per-plugin derived
   list shrink, `bos sync` delivers the shrinkage to children, `everything-dev/db` drops
   the re-exports, and `bos init`'s plugin scaffold emits the 3-file plugin.

## Risks

- **MF sharing of a bigger `every-plugin`.** The db/auth subpaths add code to the shared
  package. Mitigated by D2 (drivers/drizzle stay external/dynamic); the prototype
  confirms no static `drizzle-orm`/`pg` imports sneak into the facade.
- **Tag identity coupling.** All plugins now share one `DatabaseService` tag id. Safe
  under per-plugin scopes (loader semantics), but any future "merge plugin contexts into
  one scope" feature must switch to per-plugin tag ids — noted as a STOP condition in
  plan 018.
- **Sync churn.** Children see `db/layer.ts` etc. disappear upstream on their next
  `bos sync`. The one-cycle thin-re-export shim (D4) gives sync a clean three-way
  baseline instead of a mass deletion.

## Relationship to advisor plans

- Supersedes 001's `PluginEnv` alias; `buildScoped` itself still lands via 017.
- Subsumes 002 (context dedupe) and 007 (auth consolidation) — both become no-ops once
  017/018 land; if 002/007 execute first, 018 simply deletes their output.
- 008's consolidated migration runner lands directly inside `every-plugin/db` (017)
  instead of `everything-dev/db`.
- 010 (shared-deps unification) is unaffected — the singleton set is unchanged (D2).
- 014 is orthogonal.
