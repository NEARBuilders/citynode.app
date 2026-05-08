---
"host": patch
"everything-dev": patch
---

Remove redundant auth plugin variables from `bos.config.json` and inject them at runtime instead.

- **`host/src/services/plugins.ts`**: Added `baseVariables` parameter to `loadPluginEntry` so runtime-derived values can be merged before explicit `variables` from `bos.config.json`. When loading the auth plugin, the host now injects `account` (from `config.account`) and `domain` (from `config.domain`, defaulting to `"localhost:3000"` in development) as base variables. Explicit values in `bos.config.json` still take precedence if present.

- **`bos.config.json`**: Removed the `app.auth.variables` block. `account`, `hostUrl`, and `uiUrl` are no longer required here since the host provides `account` and `domain` automatically at plugin initialization time.
