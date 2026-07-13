---
"everything-dev": patch
---

Fix permanent hang when local dev process probe deadline expires

`spawnDevProcess` in `orchestrator.ts` probed the local HTTP readiness endpoint every 200ms with a 90s deadline. When the deadline expired, the probe fiber exited silently without calling `markError` or failing `readyDeferred` — unlike `spawnRemoteProbe`, which correctly marks the error after its deadline. If the process was running but never became ready (e.g., stuck compilation, port mismatch, unrecognized log format), `waitForReady` hung forever, permanently blocking host startup.

- Call `markError` after the 90s probe deadline, mirroring `spawnRemoteProbe`
- Handle `port <= 0` case — deadline fiber now runs regardless of port, preventing hang when readiness depends solely on log patterns
- Add 120s `Effect.timeout` on `awaitReady` in `dev-session.ts` as defense in depth, with error logging so users see when a dependency fails or times out
- Guard against empty auth URL in `config.ts` — skip auth probe when both `url` and `localPath` are empty (same guard plugins already had), preventing a 60s wasted probe on relative URLs
- Consolidate error-marking logic into `markError` helper (was duplicated 4x)
- Add idempotency guards to `spawnRemoteProbe`'s `markReady`/`markError` (matching `spawnDevProcess`)
- Move probe timeout/backoff/deadline constants to module level
