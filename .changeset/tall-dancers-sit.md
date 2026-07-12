---
"host": minor
---

Add DDoS protection middleware to host server

Adds three layers of DDoS defense to the Hono host server, applied at the edge before any expensive work:

- **Rate limiter** (`hono-rate-limiter`): 300 requests per 15-min window per IP, skips health checks and static assets. Uses `x-forwarded-for` behind proxy, falls back to socket IP. Configurable via `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX`.

- **Body limit** (`hono/body-limit`): 10 MB max on API POST/PUT/PATCH payloads. Configurable via `BODY_LIMIT_MAX`.

- **API timeout** (`hono/timeout`): 30s timeout on API routes only (not SSR streaming). Configurable via `API_TIMEOUT_MS`.

Also fixes three SSR test failures by adding auth runtime configuration to test helpers used by `runtime-remote.test.ts` and `ssr-bundled-runtime.test.ts`.
