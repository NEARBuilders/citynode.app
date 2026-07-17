---
"everything-dev": minor
---

Fix plugin DB config generation and migration slug resolution.

- `packages/everything-dev/src/db.ts` now resolves workspace slugs from the local package directory and returns the correct table name for schema-qualified `CREATE TABLE` statements.
- `api/drizzle.config.ts` and synced plugin copies now derive the database secret and fallback pglite URL from the local workspace slug.
- `api/src/db/layer.ts` and `api/src/db/migrate.ts` now use workspace-local migration journals instead of falling back to the root package name.
- `packages/everything-dev/tests/unit/db.test.ts` covers directory-based slug resolution and the corrected table extraction behavior.
