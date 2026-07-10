---
"everything-dev": patch
---

fix(db-studio): load .env before resolving plugin database info

Added `loadProjectEnv()` call in the `dbStudio` handler before
`resolvePluginDbInfo()` to ensure `.env` is loaded into `process.env`
before the database URL check. Previously the `.env` load happened in
the CLI layer after the handler had already returned, causing a
spurious "missing AUTH_DATABASE_URL" error when the variable was
actually present in `.env`.
