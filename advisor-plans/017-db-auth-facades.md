# Plan 017: Land `every-plugin/db` + `every-plugin/auth` facades and rebuild `_template`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Design doc**: [plans/v1-current/every-plugin-db-auth-absorption.md](../plans/v1-current/every-plugin-db-auth-absorption.md)
> (decisions D1–D4). **Prototype**: [plans/prototypes/db-auth-absorption/](../plans/prototypes/db-auth-absorption/)
> — the vendored facade there is the reference implementation for the API shape.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: 001 (buildScoped), 008 (runner base — its SAVEPOINT fix is the runner's foundation)
- **Category**: product direction (ticket #89)
- **Planned at**: 2026-09-15, post #89 spike

## Why this matters

A minimal DB-backed plugin carries ~250 lines of framework plumbing copied from
`_template` (db layer, driver selection, migration runner, auth middleware, context
bridge), maintained by `bos sync` overwriting local edits, with three divergent
plugin-id→slug normalizers. The design doc settles the API; this plan lands it.

## Steps

1. **`every-plugin/db` subpath** (`packages/every-plugin/src/db/index.ts` + package.json
   exports entry following the `./effect` facade pattern):
   - `DatabaseService` tag (single id `"every-plugin/Database"`), `DatabaseLive(url, { pluginId, schema?, migrations?, schemaIsolation? })`,
     `createDatabaseDriver` (dynamic `import()` of pg/pglite — prototype `facade/db.ts`),
     `runMigrations` (plan 008's consolidated runner with the SAVEPOINT fix),
     `pluginSchemaName`, re-exported `pluginMigrationSlug`/`getMigrationStorage`.
   - **No static runtime imports of `pg`, `@electric-sql/pglite`, or `drizzle-orm`**
     (`import type` only). Verify with:
     `grep -rn "from \"pg\"\|from \"@electric-sql/pglite\"\|from \"drizzle-orm" packages/every-plugin/src/db/`
     → only `import type` lines.
2. **`every-plugin/auth` subpath** (`packages/every-plugin/src/auth/index.ts`): port
   `api/src/lib/auth.ts`'s `createAuthMiddleware` machinery generic over
   `TAuthContext extends AuthContextShape` (facade version in the prototype), plus
   `parseOrgMetadata` and the context type helpers.
3. **Plugin id plumbing**: add `pluginId: string` to `PluginInitializeInput`
   (`packages/every-plugin/src/plugin.ts`) and populate it in
   `plugin-loader.service.ts` where `initialize` is invoked (~:283). Keep
   `Effect.provideService(PluginIdTag, …)` and the `Scope.Scope | PluginIdTag` union
   in the accepted initialize type through the migration window (plan 019 drops them).
4. **Root exports**: export `buildScopedContext`/`buildScoped` from `every-plugin`
   (already created by plan 001 in `effect-helpers.ts` — wire into `src/index.ts`).
5. **`everything-dev/db` re-exports**: `packages/everything-dev/src/db/index.ts`
   re-exports `pluginMigrationSlug`, `getMigrationStorage`, `normalizeSlug` from
   `every-plugin/db` (runtime import direction flips). CLI-only pieces
   (`workspaceIdentityFromModuleUrl`, drizzle-kit helpers, bindings) stay.
6. **Rebuild `plugins/_template`** on the facades: delete `src/db/{layer,index,migrate,migrator}.ts`
   and `src/lib/{context,auth}.ts`; `src/index.ts` becomes
   contract+service+index shape (see prototype `demo-plugin/`); keep the
   virtual-module migration pipeline (`DrizzleORMMigrations()` rspack plugin) feeding
   `DatabaseLive`'s `migrations` option. `rspack.config.js` externals unchanged.
7. **Tests**: port the prototype's proofs into `packages/every-plugin/tests/` —
   slug semantics, schema isolation + journal + idempotence (pglite),
   initialize-R-narrows-to-Scope, auth middleware narrowing. Update
   `_template`'s tests to the new file list.

## Verification

- `bun run build` in `packages/every-plugin` and `packages/everything-dev` (stale-dist
  crash class), then `bun typecheck`, `bun lint`.
- `bun run --cwd packages/every-plugin test`, `bun run --cwd plugins/_template test`
  (or the workspace's suite runner), and `bun run --cwd host test`.
- `cd plugins/_template && bun run build` — the remote builds with the facade and the
  driver externals intact (`externals: ["pg", "@electric-sql/pglite"]`).
- `bos mf check` from the repo root after a deploy dry-run.

## STOP conditions

- The `every-plugin` dist bundle statically pulls `pg`/`pglite`/`drizzle-orm` (check
  the built `dist/db/*` imports) — that grows the MF singleton surface; redesign the
  subpath to dynamic imports instead of shipping.
- Two plugins' `DatabaseService` instances observable in one Effect context during
  host integration tests — scope isolation assumption broken; revisit the single-tag
  decision (design doc "Risks").
- The `every-plugin/auth` port cannot express the org-meta narrowing without the
  generated types — parameterize further or stop for design review.
