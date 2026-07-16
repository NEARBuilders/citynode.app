---
"every-plugin": minor
"api": patch
"host": patch
"@everything-dev/apps-plugin": patch
"@every-plugin/template": patch
---

**every-plugin:**
- Broaden `Effect.annotateLogs({ plugin: pluginId })` to cover the full plugin lifecycle — `usePlugin`, `loadPlugin`, `instantiatePlugin`, and `initializePlugin` — so all logs including Module Federation operations and database migrations are tagged with the plugin's registry key
- Convert Module Federation service `console.log` calls to `Effect.logDebug` (registering/loading) and `Effect.logInfo` (registered/loaded) with proper log levels
- Refactor `formatORPCError` to return `string | null` instead of calling `console.error` directly, enabling callers to log through Effect's structured system
- Make `toPluginRuntimeError` and `wrapORPCError` pure functions (no side effects); add `Effect.tapError` with `Effect.logError` at 4 call sites in `plugin-loader.service.ts` for plugin-aware error logging
- Remove `formatPluginError` (dead code after purity refactor)
- Remove redundant `Effect.annotateLogs` from `plugin-loader.service.ts` (now covered at runtime level)

**api:**
- Convert 3 startup `console.log` calls to `Effect.logInfo` so `[API]` startup messages gain the `plugin=api` annotation
- Convert `Effect.log` to `Effect.logInfo` for shutdown

**host:**
- Import `logger` wrapper in `plugins.ts` and replace all raw `console.*` calls with `logger.*` (for async contexts) or `Effect.log*` (for Effect generator contexts)
- Restructure `catchAll` block to `Effect.gen` for proper `Effect.logError`/`Effect.logWarning` usage
- Fix 2 stray `console.*` calls in `program.ts` to use `logger`

**@everything-dev/apps-plugin:**
- Convert `console.log` to `Effect.logInfo` for startup message
- Convert `Effect.log` to `Effect.logInfo` for shutdown

**@every-plugin/template:**
- Convert publish failure `console.log` to `Effect.logWarning` for proper log level and annotation
- Remove `[Event]` debug `console.log` from streaming handler; use `getEventMeta` for meaningful event ID filtering instead
- Restructure `getById` to `Effect.gen` wrapper with `Effect.logInfo` for service call logging
