---
"everything-dev": minor
---

Implement isolated migration journals per plugin workspace and add database diagnostics tools.

- `api/src/db/migration-storage.ts` — new shared helper that derives a stable slug from the workspace `package.json` name and provides isolated journal table naming (`drizzle.__drizzle_migrations_<slug>`).

- `api/src/db/migrate.ts` — runtime migrator now accepts an optional `MigrationStorage` config. When provided, uses the isolated journal table. Includes legacy hash import from the old shared `drizzle.__drizzle_migrations` and `public.drizzle_migrations` tables (filtered to local migration hashes only). Exports `detectDrift()` that checks whether expected tables from migration SQL exist in the `public` schema and classifies the result.

- `api/src/db/layer.ts` — resolves migration storage on startup, logs the journal table in use, and fails with a clear drift error when the journal says "applied" but tables are missing.

- `api/drizzle.config.ts` — adds `migrations.schema` and `migrations.table` to keep Drizzle CLI aligned with the runtime journal table.

- `packages/everything-dev/src/cli/db-doctor.ts` — new CLI command (`bos db doctor <plugin>`) that inspects a plugin's isolated migration journal, local migration files, and expected tables, then reports health diagnosis.

- `packages/everything-dev/src/cli/db-repair.ts` — new CLI command (`bos db repair <plugin>`) that resets the isolated journal table and reapplies migrations via `drizzle-kit migrate`. Refuses automatic repair for partial drift or unhealthy states.

- `packages/everything-dev/src/contract.ts`, `contract.meta.ts`, `plugin.ts`, `cli.ts` — wiring for the two new commands.

- `packages/everything-dev/src/cli/db-studio.ts` — generated remote drizzle configs now include the matching `migrations` block.

- `packages/everything-dev/src/cli/sync.ts` — adds `api/src/db/migration-storage.ts` to framework-owned sync files. Plugins with `src/db/` directories automatically receive the new helper.

- `packages/everything-dev/src/cli/init.ts` — child projects get `db:doctor` and `db:repair` root scripts.

- `api/tests/unit/migration-storage.test.ts` — covers slug derivation, table naming, legacy candidates, and expected table extraction from SQL.

Migration drift detection: when `api/src/db/layer.ts` detects the journal has applied hashes but expected tables are missing, startup fails with a specific error pointing to `bos db doctor` and `bos db repair`.
