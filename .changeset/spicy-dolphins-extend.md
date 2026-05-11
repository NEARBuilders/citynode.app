---
"everything-dev": minor
---

Add env-aware `extends` with deep merge, resolved config lifecycle, and code quality improvements

**Features:**
- `extends` field now supports object form `{ development?, production?, staging? }` for env-specific parent configs with fallback chain (requested env → production → first defined)
- `defu`-based deep merge for extends chains: child overrides parent scalars, shared deps deep-merge, secrets union, null/false sentinel removes inherited plugins
- Resolved config lifecycle: `bos dev`/`bos build` write to `.bos/bos.resolved-config.json` (gitignored) instead of mutating `bos.config.json`; `bos publish --deploy` still writes production URLs to `bos.config.json`
- Canonical key ordering enforced everywhere via shared `rebuildOrderedConfig()`
- `_resolved` metadata uses shared `ResolvedConfigMeta` interface for consistent shape
- Build handler derives env from context (production for deploy, development otherwise)
- `buildRuntimeConfig` host URL now respects env param instead of always using development
- Config validation in shared sync via `BosConfigSchema.parse`
- 5s fetch timeout for remote plugin manifest resolution
- Staging env support in `RuntimeConfig` and `ClientRuntimeConfig` schemas

**Refactors:**
- Extract `isPathExcluded` utility (unifies init.ts + sync.ts exclude matching with `/*` pattern support)
- Extract `saveBosConfig` utility (shared between plugin.ts + init.ts)
- Extract `generateAuthTypesTemplate()` (eliminates 3x duplicate auth-types template string)
- Replace manual `mkTmpDir` with `mkdtempSync`
- Remove duplicate `ExtendsConfig` interface (was in both merge.ts + types.ts)
- Remove unused `defu` re-export from merge.ts
- Replace `(pluginInput as any)` with proper `BosConfigInput | null | false` typing
- Narrow `writeResolvedConfig` env from `string` to `BosEnv` union type
- Document why `syncTemplate` reads raw `bos.config.json` instead of resolved config

**Tests:** 31 new integration tests (88 total, up from 57)
