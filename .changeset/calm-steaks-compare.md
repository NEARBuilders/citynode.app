---
"every-plugin": minor
---

Add automatic plugin-aware log annotations via `Effect.annotateLogs` across the full plugin lifecycle (load, instantiate, initialize), so all logs including Module Federation operations and database migrations are tagged with the plugin's registry key.

Convert `console.log` to Effect structured logging (`Effect.logInfo`/`Effect.logDebug`/`Effect.logError`/`Effect.logWarning`) across the framework:

- **Module Federation service**: Registration and loading progress now use `Effect.logDebug`/`Effect.logInfo` with proper log levels
- **Error formatting**: `formatORPCError` returns a string instead of calling `console.error` directly, enabling callers to log through Effect's structured system
- **Error conversion**: `toPluginRuntimeError` and `wrapORPCError` are now pure functions (no side effects); call sites use `Effect.tapError` with `Effect.logError` for plugin-aware error logging
- **Plugin templates**: Startup/shutdown logs use `Effect.logInfo`; publish failures use `Effect.logWarning`
- **API startup**: `[API] Services Initialized` and related logs now use `Effect.logInfo` (gain `plugin=api` annotation)
- **Host `plugins.ts`**: Uses `logger` wrapper instead of raw `console.*`; Effect-gen-context logs use `Effect.logInfo`/`Effect.logError`
- **Host `program.ts`**: Stray `console.*` calls fixed to use `logger`

Rename `DatabaseTag` identifier from `"api/Database"` to `"Database"` for generic correctness across API and plugin contexts.
