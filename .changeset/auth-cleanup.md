---
"@everything-dev/auth-plugin": minor
---

Clean up PostgreSQL migration artifacts and tighten type safety.

### Auth Plugin
- Remove stale `types/db/layer.d.ts` (source file was deleted in the PostgreSQL migration).
- Replace `any` in Drizzle query callbacks with inferred types (`auth-instance.ts`, `index.ts`).
- Tighten `AuthDatabase` type from `PgDatabase<any, ...>` to `PgDatabase<PgQueryResultHKT, ...>`.
- Add `.gitignore` for local pglite artifacts (`auth-local.db`, `test-auth.db`).
- Add `githubClientId` and `githubClientSecret` optional dev defaults to `plugin.dev.ts`.
- Update README to reflect pglite instead of libsql.
