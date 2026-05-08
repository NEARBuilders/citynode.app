---
"everything-dev": patch
---

Fix `bos init` failing on fresh projects due to missing database migration files.

- **`.templatekeep`**: Add `api/src/db/load-migrations.ts`, `api/src/db/migrator.ts`, and `api/src/global.d.ts` to the template allowlist. These source files are imported by `api/src/index.ts` and are required for the API to compile.
- **`src/cli/init.ts`**: Export `execCommand` and add `generateDatabaseMigrations()`. This function scans the initialized project for any `drizzle.config.ts` (excluding `node_modules`), checks if the workspace has a `db:generate` script, and runs it.
- **`src/plugin.ts`**: Call `generateDatabaseMigrations()` after `runBunInstall()` during `bos init`. This ensures fresh projects have their Drizzle migrations generated from the schema before the first build, fixing both `MODULE_NOT_FOUND` errors for missing source files and `ENOENT` errors for missing `_journal.json`.
