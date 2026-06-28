---
"everything-dev": minor
---

Add `--remote-plugins` flag to `bos dev` for per-plugin remote toggle

```bash
bos dev --remote-plugins auth,registry
```

Forces specified plugins to use their production URLs even when a local
development path exists on disk. Useful when working on a subset of
plugins locally while using deployed versions for others.

The flag accepts a comma-separated list of plugin IDs and can be combined
with existing flags like `--host remote` or `--ui remote`. Remote plugins
appear in the dev view as "(remote) loaded" and are probed via their
production mf-manifest.json endpoint rather than started as local processes.

Adds `DEBUG=true` diagnostic traces in the dev handler and orchestrator
to help troubleshoot plugin resolution and startup issues.
