---
"everything-dev": patch
---

Dev startup performance improvements

- Parallelize npm registry version checks in `bos status` (was sequential)
- Run `warnIfOutdated` concurrently with dev startup instead of blocking it
- Parallelize `buildEveryPluginQuietly` and `buildEverythingDevQuietly` builds
- Parallelize plugin resolution in `resolveRuntimePlugins` and `resolveConfigComposableEntries`
- Parallelize contract bridge plugin source resolution in `syncApiContractBridge`
- Skip redundant `loadResolvedConfig` call when no install or build occurred
- Add in-memory GET response cache to `http-client` (30s TTL) to eliminate duplicate HTTP fetches
- Remove redundant `ensureEnvFile`/`loadProjectEnv` calls in dev and start handlers
- Guard `loadProjectEnv` to only load `.env` once per config directory
- Memoize `findConfigPath` directory walk results
- Precompute sorted command catalog instead of sorting on every invocation
- Remove 0-2s random jitter from remote probe startup
- Add timing summaries to `bos dev` output
- Fix FastKV config fetches to use retry logic (was falling to no-retry path on transient errors)
