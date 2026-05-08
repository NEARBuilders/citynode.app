---
"api": minor
"@everything-dev/auth-plugin": patch
"@everything-dev/projects-plugin": minor
"ui": minor
---

Switch from PGlite to Docker Postgres for development, fix multi-instance WASM crash, add auto-migration and infinite scroll for projects

The host was crashing with `RuntimeError: Aborted()` because multiple PGlite WASM instances cannot coexist in a single Node.js process. This replaces in-process PGlite with Docker Postgres for development, and adds several related fixes:

- Add `docker-compose.yml` with 3 postgres:17-alpine services (api:5432, auth:5433, projects:5434)
- Add `dev:postgres`, `dev:postgres:down`, `dev:postgres:reset` convenience scripts
- Declare `API_DATABASE_URL` and `PROJECTS_DATABASE_URL` secrets in `bos.config.json` so the host injects them into plugins
- Conditionally disable SSL for localhost connections in `createDatabaseDriver` (3 files)
- Add auto-migration to API and projects plugins on startup (matching auth plugin's existing pattern)
- Fix projects `listProjects` pagination: move visibility filter from JS post-filter to SQL WHERE clause, add offset-based cursor pagination
- Add infinite scroll with IntersectionObserver to projects list UI
- Default project visibility to `public` instead of `private`
- Show all visible projects (public/unlisted from everyone + own private) instead of filtering to current user only
- Fix CI: replace broken `file:./api-test.db` with postgres service container
