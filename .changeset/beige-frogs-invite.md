---
"everything-dev": patch
---

Remove dead host, api, and federation.server modules

Delete `src/host.ts` (573-line Hono server), `src/api.ts` (181-line plugin loader), and `src/federation.server.ts` (43-line SSR module loader). These were superseded by the `host/` workspace and had zero consumers.

Also removes the `./api` and `./host` sub-path exports from package.json, and drops `@hono/node-server`, `hono`, `@orpc/contract`, `@orpc/openapi`, `@orpc/server`, and `@orpc/zod` from dependencies (no runtime references remain).