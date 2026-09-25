---
"every-plugin": major
---

**Breaking:** strict v2 plugin layout — no backwards compatibility. The MF expose resolves `api/src/index.ts` and contract types resolve `api/src/contract.ts`; the legacy `src/index.ts` / `src/contract.ts` layout throws a migration error instead of being detected. The dev config resolves `bos.dev.ts` only — `plugin.dev.ts` throws with a rename hint. `createPluginBaseConfig` / `EveryPluginBuild` gain a typed `entry` override for workspaces that *are* the api slot themselves (the root `api/` workspace passes `entry: "src/index.ts"` via `build.config.ts`). Migration: `mkdir api && git mv src api/src` and rename `plugin.dev.ts` → `bos.dev.ts`.
