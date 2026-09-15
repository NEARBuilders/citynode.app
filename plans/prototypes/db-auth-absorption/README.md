# every-plugin/db + every-plugin/auth absorption prototype

Throwaway prototype for [plans/v1-current/every-plugin-db-auth-absorption.md](../../v1-current/every-plugin-db-auth-absorption.md)
(ticket [#89](https://github.com/NEARBuilders/citynode.app/issues/89)).

It vendors the **proposed** `every-plugin/db` and `every-plugin/auth` facades
(`facade/`) and a demo plugin written against them (`demo-plugin/`) to answer the
spike's questions before the real packages change:

1. Can a fresh DB-backed plugin be **contract + service + index + migrations** — no
   `db/layer.ts`, `db/index.ts`, `db/migrate.ts`, `lib/context.ts`, `lib/auth.ts`?
2. Can `initialize`'s R channel narrow to `Scope.Scope` with **no `PluginIdTag`
   import** anywhere in plugin code? (Yes — the plugin id rides in
   `PluginInitializeInput.pluginId`, closed over by `DatabaseLive`. Effect 4 removed
   `FiberRef`, so ambient injection was rejected.)
3. Does the canonical slug rule (`plugin_<pluginMigrationSlug(pluginId)>`,
   unconditional, `@scope/name-plugin`-aware) hold end-to-end — schema, journal, and
   secret-name derivation?
4. Can the facade avoid static `pg` / `@electric-sql/pglite` / `drizzle-orm` runtime
   imports (drivers via dynamic `import()`, drizzle as `import type` only), keeping the
   MF singleton share set unchanged?

## Run

No install needed — dependencies resolve from the repo root.

```bash
bunx vitest run          # tests/
bunx tsc --noEmit        # type proofs
```

## Layout

```
facade/          vendored proposal — what every-plugin/db + /auth would export
  db.ts          DatabaseService, DatabaseLive, createDatabaseDriver, runMigrations
  slug.ts        canonical pluginMigrationSlug / getMigrationStorage (from everything-dev/db)
  auth.ts        createAuthMiddleware, generic over the workspace's generated context type
demo-plugin/     what a plugin author writes after absorption
  contract.ts    typed route contract (zod input/output)
  service.ts     plain functions against DatabaseService
  index.ts       initialize: Effect<Deps, DatabaseError, Scope.Scope> — no PluginIdTag
  migrations/    SQL migrations, applied by the facade's runner
tests/           the proofs (R-channel, slug, migrations, idempotence, auth)
```

## Deviations from the real facade (throwaway scope)

- `DatabaseService` carries a minimal query interface instead of the drizzle
  `PgDatabase` generics (drizzle appears only as `import type` in the real design; the
  demo plugin shows raw SQL, a real plugin may statically import `drizzle-orm/pg-core`
  in its own bundle).
- `contract.ts` is a plain typed contract shape, not a wired `@orpc/contract` router —
  the spike is about the db/auth seam, not the oRPC surface.
- The driver implements the pglite branch fully (tested) and the `pg.Pool` branch
  structurally (untested here).
