---
"everything-dev": patch
---

Improve database error visibility and migration diagnostics:

- `api/src/lib/context.ts` — `flattenError` helper walks nested Error.cause chains so Drizzle/pg errors include the real underlying reason instead of just the SQL wrapper message. Mirrored to `plugins/_template/src/lib/context.ts` and `plugins/apps/src/lib/context.ts`.

- `api/src/db/migrate.ts` — `loadMigrations()` now logs migration source (virtual/disk) and count; `migrate()` returns the number of applied migrations.

- `api/src/db/layer.ts` — logs precise migration status (applied/total/source) and warns when zero migrations are found.

- `api/src/db/index.ts` — adds pool-level error listener for surfacing unexpected pg errors; makes `close()` idempotent.

- `host/src/program.ts` — actually emits the `formatORPCError` output instead of discarding it.

- `api/tests/unit/context.test.ts` and `api/tests/unit/db.test.ts` — cover cause-chain flattening and database error unwrapping.
