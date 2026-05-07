---
"@everything-dev/auth-plugin": patch
---

Default auth database to `:memory:` for local development

- `plugins/auth/plugin.dev.ts`: Change `AUTH_DATABASE_URL` default from `pglite:./auth-local.db` to `:memory:`
- `plugins/auth/src/index.ts`: Change `AUTH_DATABASE_URL` schema default from `pglite:./auth-local.db` to `:memory:`

This eliminates PGlite filesystem initialization failures during local development. Users can still override with `AUTH_DATABASE_URL` environment variable for persistent storage.
