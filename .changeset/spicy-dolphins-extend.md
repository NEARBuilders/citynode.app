---
"everything-dev": minor
"@everything-dev/apps-plugin": minor
"@every-plugin/settings": minor
"@everything-dev/projects-plugin": patch
---

Plugin-as-bosconfig architecture with sidebar generation and plugin UI remotes

**Features:**
- `extends` field supports object form `{ development?, production?, staging? }` for env-specific parent configs with fallback chain
- `defu`-based deep merge for extends chains: child overrides parent scalars, shared deps deep-merge, secrets union, null/false sentinel removes inherited plugins
- Resolved config lifecycle: `bos dev`/`bos build` write to `.bos/bos.resolved-config.json` (gitignored) instead of mutating `bos.config.json`
- Plugin bos.config.json files are standalone (no `extends`) — define `domain`, `app`, `sidebar`, `routes` independently
- Root plugin entries use `extends: "bos://..."` to resolve production config from remote registry
- String shorthand for plugin entries: `"key": "bos://account/domain"` normalizes to `{ extends: "bos://..." }`
- Sidebar generation from plugin configs with `roleRequired` ("anon"|"member"|"admin") filtering
- Plugin UI remotes: host loads sub-FederationEntry from `app.ui` in plugin config
- `bos publish --deploy` publishes both root and plugin bos.config.json to registry
- `pluginPublish` prefers plugin config `domain` field over extends parsing for registry path
- `personalizeConfig` creates standalone plugin bos.config.json files (domain + app + sidebar + routes)
- Plugin UI support: `detectLocalPackages` discovers plugin UI, `prepareDevelopmentRuntimeConfig` assigns ports
- Canonical key ordering enforced everywhere via shared `rebuildOrderedConfig()`
- Config validation in shared sync via `BosConfigSchema.parse`
- Staging env support in `RuntimeConfig` and `ClientRuntimeConfig` schemas

**Refactors:**
- Renamed `registry` → `apps`, `_template` → `settings`
- Organizations moved to auth sidebar
- `resolveRuntimePlugins` no longer recursively resolves nested plugins from extends chains
- Plugin rspack configs: removed `updateRootConfig` (plugins never update root), generalized `updateLocalConfig` to `updateLocalConfigSection` for any `app.{section}`
- Release workflows commit `**/bos.config.json` (root + plugins) instead of just root
- `personalizeConfig` strips `extends` and production URLs from plugin bos.config.json in both init and sync modes
- Extract `isPathExcluded`, `saveBosConfig`, `generateAuthTypesTemplate()` utilities
- Replace `(pluginInput as any)` with proper typing, add `getPluginRef()` helper
- Remove unused `resolveBosConfigInput` helper

**Tests:** 31 new integration tests (88 total, up from 57)
