---
"every-plugin": major
---

**Breaking — clean v2 break, no backwards compatibility.** Plugin layout is strict: the MF expose resolves `api/src/index.ts`, contract types resolve `api/src/contract.ts` (the plugin App's `api` slot, declared in its `bos.app.ts`). The legacy `src/index.ts` / `src/contract.ts` layout throws a migration error. The dev config resolves `bos.dev.ts` only — `plugin.dev.ts` throws with a rename hint. Workspaces that *are* the api slot themselves (the root `api/` workspace) resolve `src/index.ts` via the ancestor config's `app.api.development` declaration — no per-workspace overrides. `BOS_PLUGIN_DEV_CONFIG` env-first overlay kept for composition. Migration: `mkdir api && git mv src api/src`, rename `plugin.dev.ts` → `bos.dev.ts`, add a `bos.app.ts`.
