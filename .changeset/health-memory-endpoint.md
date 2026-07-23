---
"host": patch
---

Extracted health/memory profiling into `host/src/routes/health.ts`. `/api/_health` now includes `memory` (rss, heapTotal, heapUsed, external in bytes + MB) and per-plugin metadata (key, name, remoteUrl, version). New `/api/_memory` endpoint accepts `?gc=true` to force GC before returning the memory snapshot. Documented `DB_POOL_MAX`, `DB_CONNECTION_TIMEOUT_MS`, `DB_IDLE_TIMEOUT_MS`, `DB_SSL_REJECT_UNAUTHORIZED` in `.env.example`.
