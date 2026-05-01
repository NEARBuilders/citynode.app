---
"everything-dev": patch
---

Allow `api/package.json`, `api/plugin.dev.ts`, and `api/rspack.config.js` to sync on upgrade with package.json merge logic that preserves project-specific deps and scripts; protect `ui/src/components/**` and all `api/src/**` from sync overwrite
