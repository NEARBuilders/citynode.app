---
"everything-dev": patch
"host": patch
---

Fixed production host binding to port 443 (derived from the HTTPS CDN URL) instead of the planned listening port (3000, or `--port` flag value). The planner already resolved the correct port, but the `start` command discarded `plan.runtimeConfig` and stored the original — whose `host.port` came from `parsePort(remoteUrl)`. Now `start` uses `plan.runtimeConfig` so each app binds to its allocated port. Also stops deriving the listening port from the remote URL in `buildRuntimeConfig` for production; uses `DEFAULT_HOST_PORT` and lets the planner override.