---
"every-plugin": minor
"everything-dev": patch
"host": patch
---

Make Module Federation shared dependencies config-driven and fix Docker production runtime crash.

**Problem:** `every-plugin` hardcoded `drizzle-orm` and `better-auth` as shared MF deps, but these are app-specific packages. In Docker's isolated linker mode, `import("drizzle-orm")` from `every-plugin` failed because the generic framework package does not declare them as dependencies.

**Solution:**
- **Core shared deps** (`every-plugin`, `effect`, `zod`, `@orpc/contract`, `@orpc/server`) remain hardcoded in `every-plugin` — these are what the framework itself needs.
- **App-specific shared deps** moved to `bos.config.json` under `shared.plugins` (same shape as existing `shared.ui`).
- `ModuleFederationService` now accepts runtime `appShared` config via Effect Context (`AppSharedDepsTag`) and dynamically imports configured packages with `import(name)`.
- `PluginRuntimeConfig` gains optional `shared` field; `PluginService.Live` threads it through the layer chain.
- `RuntimeConfigSchema` validates `shared.plugins` alongside `shared.ui`.

**Build-time cleanup:**
- Removed `better-auth`/`drizzle-orm` from `pluginSharedDependencies` in `packages/every-plugin/src/build/shared-deps.ts`.
- Host `rsbuild.config.ts` now merges `bosConfig.shared.plugins` into build-time shared deps.

**Production startup hardening:**
- Added preflight validation in `bos start`: checks `shared.plugins` packages are resolvable, validates required secrets from auth/api/plugin configs, warns on missing values.
- `CORS_ORIGIN` defaults to `https://<config.domain>` when unset in production.
- Fixed empty error messages in plugin loading by adding `formatError()` helper that properly extracts Effect Cause chains.
- Removed duplicate secret warnings from `secretsFromEnv` — consolidated in pre-startup validation.

**Files changed:**
- `packages/every-plugin/src/runtime/mf-config.ts`
- `packages/every-plugin/src/runtime/services/module-federation.service.ts`
- `packages/every-plugin/src/runtime/services/plugin.service.ts`
- `packages/every-plugin/src/runtime/index.ts`
- `packages/every-plugin/src/types.ts`
- `packages/every-plugin/src/build/shared-deps.ts`
- `packages/everything-dev/src/types.ts`
- `packages/everything-dev/src/plugin.ts`
- `host/src/services/plugins.ts`
- `host/rsbuild.config.ts`
- `bos.config.json`
