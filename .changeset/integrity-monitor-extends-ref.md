---
"everything-dev": patch
"host": patch
---

Fix integrity monitor false positives for extended remotes. When a composable entry (auth, plugin) uses `extends`, its integrity hash is resolved from the parent config at startup. If the parent is redeployed, the running host's monitor checked against the stale hash. Now stores `extendsRef` on RuntimeConfig entries so the monitor can re-fetch the parent config from FastKV to get the latest integrity before verifying. Also runs the first integrity check immediately instead of waiting for the first interval tick.
