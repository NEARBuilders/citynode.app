---
"api": patch
"host": patch
"plugins/proposals": patch
"plugins/votes": patch
"plugins/auth": patch
"@every-plugin/template": patch
"everything-dev": minor
---

Consolidate the migration runner and DB driver into `everything-dev/db` (advisor plan 008).

**Root-cause fix for the boot race** (`duplicate key value violates unique constraint "pg_type_typname_nsp_index"` on `drizzle.__drizzle_migrations` when plugins booted concurrently against one shared database): `ensureMigrationTable`'s retry used `Effect.retry(..., until: isRetryableMigrationError)` — in Effect, `until` means *stop* retrying when the predicate is true, so the race error the retry was built to absorb got zero retries (verified: 1 attempt with `until`, 4 with `while`). The shared runner now uses `while: isRetryableMigrationError`. `plugins/auth` had no retry at all and now inherits the shared one.

**Shared runner** (`everything-dev/db`): `runMigrations(db, migrations, opts) => Effect<MigrationReport, DatabaseError>` with SAVEPOINT/ROLLBACK/RELEASE duplicate-DDL tolerance (fixes the proposals/votes bare-`continue` 25P02 aborted-transaction bug — the fix previously lived only in api and never propagated), retryable-SQLSTATE journal-init backoff, hash-tracked idempotence, and the duplicate-table preflight. `detectDrift`/`loadMigrations`/`loadMigrationsFromDisk` move with it; `loadMigrations` takes the bundler's virtual-module loader as an option so the shared package never names `virtual:drizzle-migrations.sql`.

**Shared driver** (`everything-dev/db`): `createDatabaseDriver(url, schema, namespace?)` — engine by URL scheme (`pglite:`/`:memory:` → PGlite, else postgres), protocol-level `search_path`, **one-time** `CREATE SCHEMA` via `pool.connect()` (replaces votes/proposals' per-connection `on("connect")` handler that re-raced `CREATE SCHEMA IF NOT EXISTS` on every connection), env-driven pool config (`DB_POOL_MAX` etc.), idempotent close (drops auth's `pool.end()` stack-trace noise). Plus `pluginSchemaName(pluginId)` and a single shared `DatabaseError`.

**Workspaces**: api/votes/proposals/auth `db/migrate.ts` and `db/index.ts` become thin sync-propagated adapters (< 40 lines; `bos sync` copies api's canonical copies verbatim into plugins). `plugins/_template` aligns fully to the standard flow: `migrator.ts` deleted (renamed to `migrate.ts`), canonical layer adopted, journal standardized to `drizzle.__drizzle_migrations` (pre-existing tables are auto-recorded by the preflight; the old in-schema `drizzle_migrations` table is frozen, matching 017/D6), and the `TemplateDatabase` alias is dropped. `adoptPublicTables` is deliberately **not** ported: it was a one-time boot-time `ALTER TABLE ... SET SCHEMA` relocation for pre-schema-isolation databases (live dev DB has zero `public` tables); legacy adoption stays with the fail-closed `detectDrift`/`bos db doctor` path, never boot-time magic.

Regression suite added at `packages/everything-dev/tests/unit/db-run-migrations.test.ts`: fresh-schema, partial-overlap savepoint path (previously failed on proposals/votes with 25P02), duplicate-preflight journal recording, and a retry-semantics test pinning 3+ gen-runs on `23505`.
