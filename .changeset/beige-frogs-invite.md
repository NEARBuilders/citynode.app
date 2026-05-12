---
"everything-dev": patch
---

Remove dead modules and unused sub-path exports

Delete `src/host.ts`, `src/api.ts`, and `src/federation.server.ts` — superseded by the `host/` workspace with zero consumers.

Remove `./api`, `./host`, `./orchestrator`, and `./shared` sub-path exports from package.json (no external consumers).

Remove `@hono/node-server`, `hono`, `@orpc/contract`, `@orpc/openapi`, `@orpc/server`, and `@orpc/zod` from dependencies (no runtime references remain). Update tsdown.config.ts accordingly.