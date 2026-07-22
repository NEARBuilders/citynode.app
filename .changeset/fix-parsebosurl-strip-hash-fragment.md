---
"everything-dev": patch
---

Strip hash fragment from BOS URL in `parseBosUrl` to fix IntegrityMonitor lookup failure when an `extends` reference includes a JSON pointer target (e.g. `bos://auth.everything.near/auth.everything.dev#app.auth`). The fragment has no meaning in FastKV key resolution and was causing "No config found" errors during integrity checks.
