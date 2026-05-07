---
"everything-dev": patch
---

Improve `bos start` non-interactive logging and startup summary.

- Add a clear startup summary showing Config Source (with clickable FastKV URL when loading from registry), Account, Domain, and loaded Modules (HOST, UI, API, AUTH).
- Consolidate warnings (missing secrets, CORS_ORIGIN defaulting) into the summary instead of scattered log lines.
- Expand `LOG_NOISE_PATTERNS` to suppress host-internal chatter: Module Federation loading, `[IntegrityMonitor]`, `[Plugins]` internals, separator dumps, and empty `{}` lines.
- Skip whitespace-only lines in `renderStreamingView` to prevent blank log output.
