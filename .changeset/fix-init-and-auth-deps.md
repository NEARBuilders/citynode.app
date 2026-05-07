---
"everything-dev": patch
"@everything-dev/auth-plugin": patch
---

Fix init config ordering, parent plugin leakage, auth pglite resolution, and plugin selection

- `packages/everything-dev/src/cli/init.ts`: Fix `bos.config.json` key ordering so `extends` is always first and trailing group (`app`, `plugins`, `shared`) is last. Prevent parent plugin leakage by writing `"plugins": {}` instead of deleting the key when no plugins are selected.
- `packages/everything-dev/src/cli/prompts.ts`: Remove `registry` from `AVAILABLE_PLUGINS` since `.templatekeep` only includes `plugins/_template/**`.
- `plugins/auth/package.json`, `host/package.json`, `package.json`: Move `@electric-sql/pglite` to runtime `dependencies` so the auth plugin can resolve it when loaded remotely via Module Federation.
