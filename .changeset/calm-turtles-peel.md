---
"everything-dev": patch
---

Fix docker-compose port switching with many plugins

- `resolvePort` now uses `basePort` as a floor to prevent port regression
- Stale port entries from removed plugins are pruned on each run
- Database and Redis secrets are sorted by slug for deterministic assignment
- `.bos/infra-state.json` is no longer gitignored, so port assignments persist across clones
