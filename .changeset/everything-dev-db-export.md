---
"everything-dev": minor
---

Extract DB convention helpers into shared `everything-dev/db` package export.

- `packages/everything-dev/src/db.ts` — new subpath export containing pure DB convention helpers:
  - `MigrationStorage` type, `getMigrationSlug()`, `getMigrationStorage()`
  - `getLegacyCandidates()`, `migrateSql()`, `extractExpectedTables()`
  - `pluginMigrationSlug()` for CLI plugin key normalization
  - `getDatabaseUrlSecretName()` for deterministic `*_DATABASE_URL` naming per workspace slug

- `packages/everything-dev/package.json` — adds `./db` subpath export.

- `api/src/db/migration-storage.ts` — now re-exports from `everything-dev/db` instead of carrying inline logic.

- `packages/everything-dev/src/cli/db-studio.ts` — replaces inline `migrationSlug` with `pluginMigrationSlug` from the shared helper.

- `packages/everything-dev/src/cli/db-doctor.ts` — replaces inline `extractTables` with `extractExpectedTables` from the shared helper.

- `packages/everything-dev/src/cli/sync.ts` — adds `api/drizzle.config.ts` to framework-owned sync files; syncs it into DB-enabled plugin workspaces; adds plugin `drizzle.config.ts` to owned-file detection.

- `packages/everything-dev/tests/unit/db.test.ts` — 8 tests covering slug derivation, table naming, table extraction, secret naming, and plugin key normalization.

This reduces sync churn by centralizing the fragile name-convention logic in the published package instead of scattering it across synced local files.
