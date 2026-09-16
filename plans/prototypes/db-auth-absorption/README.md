# Per-plugin database absorption prototype

Throwaway prototype for [plans/v1-current/every-plugin-db-auth-absorption.md](../../v1-current/every-plugin-db-auth-absorption.md)
(ticket [#89](https://github.com/NEARBuilders/citynode.app/issues/89)).

> **Amendment note (2026-09-15)**: this prototype was built against the original
> decision (an `every-plugin/db` facade). The amended decision moved the home to
> **`everything-dev/db`** — see the design doc's "Why the amendment" section. The
> prototype's **proofs still stand** (slug semantics, namespace/schema isolation,
> journal + migration idempotence, R-channel narrowing via `pluginId` in the input, no
> static driver/drizzle imports). The vendored `facade/db.ts` `DatabaseLive` layer shape
> is superseded by the design doc's `databaseLayer(tag, url, { pluginId, schema,
> migrations })` factory — plugin-owned typed tag, shared layer builder — and
> `facade/auth.ts` is dropped from scope entirely (plan 007 is the auth resting point).

The spike questions it answered (before the real packages change):

1. Can a fresh DB-backed plugin be **contract + service + index + migrations** with a
   ~10-line plugin-owned layer — no copied `db/index.ts`, `db/migrate.ts`, private
   normalizer, or `PluginIdTag`?
2. Can `initialize`'s R channel narrow to `Scope.Scope` with **no `PluginIdTag`
   import** anywhere in plugin code? (Yes — the plugin id rides in
   `PluginInitializeInput.pluginId`, closed over by the layer. Effect 4 removed
   `FiberRef`, so ambient injection was rejected.)
3. Does the canonical slug rule (`plugin_<pluginMigrationSlug(pluginId)>`,
   unconditional, `@scope/name-plugin`-aware) hold end-to-end — schema, journal, and
   secret-name derivation?
4. Can the shared helpers avoid static `pg` / `@electric-sql/pglite` / `drizzle-orm`
   runtime imports (drivers via dynamic `import()`, drizzle as `import type` only),
   keeping the MF singleton share set unchanged?

## Run

No install needed — dependencies resolve from the repo root.

```bash
bunx vitest run          # tests/
bunx tsc --noEmit        # type proofs
```

## Layout

```
facade/          vendored sketch — what everything-dev/db's runtime exports look like
  db.ts          DatabaseLive (≈ databaseLayer), createDatabaseDriver, runMigrations
  slug.ts        canonical pluginMigrationSlug / getMigrationStorage (from everything-dev/db)
  auth.ts        createAuthMiddleware sketch — OUT OF SCOPE post-amendment (plan 007 instead)
  effect-helpers.ts  buildScoped sketch (effect-native initialize-returns-Layer supersedes it)
demo-plugin/     what a plugin author writes after absorption
  contract.ts    typed route contract (zod input/output)
  service.ts     plain functions against the database tag
  index.ts       initialize: Effect<Deps, DatabaseError, Scope.Scope> — no PluginIdTag
  migrations/    SQL migrations, applied by the shared runner
tests/           the proofs (R-channel, slug, migrations, idempotence, auth)
```

## Deviations from the real implementation (throwaway scope)

- The demo tag carries a minimal query interface instead of the drizzle `PgDatabase`
  generics (drizzle appears only as `import type` in the real design; the demo plugin
  shows raw SQL, a real plugin may statically import `drizzle-orm/pg-core` in its own
  bundle).
- `contract.ts` is a plain typed contract shape, not a wired `@orpc/contract` router —
  the spike is about the db seam, not the oRPC surface.
- The driver implements the pglite branch fully (tested) and the `pg.Pool` branch
  structurally (untested here).
- `databaseLayer` (a factory taking the plugin's own tag) replaces this prototype's
  `DatabaseLive(url, { pluginId })` — same ergonomics, one fewer shared tag; the
  prototype predates the amendment and was not reworked.
