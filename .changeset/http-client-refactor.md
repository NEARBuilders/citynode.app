---
"everything-dev": minor
---

Add shared Effect-based HTTP client, fix missing timeouts and silent error swallowing

Created `http-client.ts` — a shared fetch utility using `Effect.tryPromise`, `Data.TaggedError`, `Effect.retry`, and `Schedule.exponential` for consistent timeout, retry, and error handling across all CLI network calls.

Fixes three P0 issues (no timeout — could hang indefinitely):
- `cli/init.ts` GitHub tarball download: no timeout → added 60s via `fetchResponse`
- `integrity.ts` SRI hash compute/verify: no timeout → added 30s via `fetchResponse`
- `mf.ts` Module Federation lifecycle hooks: no timeout → added 15s via inline `AbortController`

Refactored all fetch call sites to use the shared utility via `Effect.runPromise`:
- `fastkv.ts` — `fetchJson` and `fetchRemotePluginManifest` replaced with `fetchJsonOrNull`
- `api-contract.ts` — `fetchWithTimeout` replaced with `fetchResponse`; error messages now include URL
- `config.ts` — `resolveRemotePluginRuntimeName` replaced with `fetchJsonOrNull`, fixing timer leak
- `cli/status.ts` — `fetchLatestNpmVersion` replaced with `fetchJsonOrNull`

Error handling improvements:
- `plugin.ts:1542` — empty `catch {}` now logs a warning on parent config fetch failure
- `config.ts:213` — re-thrown error now uses `{ cause: error }` to preserve stack trace
- `api-contract.ts:92,140,182` — fetch error messages now include the URL being fetched
