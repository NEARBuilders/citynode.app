---
"everything-dev": patch
"@everything-dev/auth-plugin": patch
---

Remove artificial startup timeout, fix TCP false-positive, and auth pglite initialization

- `packages/everything-dev/src/dev-session.ts`: Remove the hardcoded 30-second `awaitReady` timeout so the host genuinely waits until local plugins (auth, api, template) finish rspack compilation and serve their remote entry.
- `packages/everything-dev/src/orchestrator.ts`: Remove the TCP-port fallback in `spawnDevProcess` readiness probing. A plugin is now only considered "ready" when its HTTP endpoint returns 200, eliminating false positives where rspack opens its listen port before compilation is complete.
- `plugins/auth/src/db/driver.ts`: Add `mkdirSync(..., { recursive: true })` before initializing `@electric-sql/pglite`, fixing "PGlite failed to initialize properly" errors caused by PGlite's internal non-recursive `mkdirSync`.
