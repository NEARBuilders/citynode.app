---
"everything-dev": patch
---

feat(everything-dev): sync shared auth/context lib files to every plugin

- Refactored `api/src/lib/auth.ts` to remove dead `PluginsClient`-dependent
  exports (`AuthPluginClientFactory`, `AuthPluginClient`, `AuthCapableServices`,
  `getAuthClient`), making the file fully shareable across all workspaces
- Added per-plugin sync in `sync.ts`: `api/src/lib/auth.ts` and
  `api/src/lib/context.ts` are now synced to each local plugin's `src/lib/`
  directory during `bos sync` / `bos upgrade`
- Added per-plugin `auth-types.gen.ts` generation in `api-contract.ts` for
  each plugin's `src/lib/` directory
- Updated `plugins/_template` and `plugins/apps` to import auth/context
  from their local `./lib/auth` and `./lib/context`
- Fixed merge conflict markers in `host/src/lib/auth.ts` and
  `host/src/services/auth.ts`
