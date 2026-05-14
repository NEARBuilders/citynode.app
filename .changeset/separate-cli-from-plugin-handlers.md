---
"everything-dev": minor
---

Separate CLI presentation from plugin handler logic. Plugin handlers now emit structured progress events via `EventEmitter` instead of calling `@clack/prompts` directly; the CLI adapter subscribes and renders spinners, prompts, and colors. This makes `everything-dev/plugin` platform-agnostic — it can spawn processes and return data, but no longer imports terminal UI libraries.

- Removed `src/` from package `files` (halves published size) and added `sideEffects: false`
- Expanded `neverBundle` list: `@clack/prompts`, `@effect/*`, `@orpc/*`, `@standard-schema/*`, `execa`, `defu`, `openapi-types`
- Removed `plugin` from barrel export (`everything-dev`) — import `everything-dev/plugin` directly
- `init` handler no longer prompts or shows spinners — CLI handles interactive `docker compose` confirm, parent config confirmation, and live progress via `pluginEvents`
- `dev`/`start` handlers store session data via `consumeDevSession()` instead of starting Ink UI directly — CLI launches the terminal session
- `start` handler returns structured `StartSummary` data instead of printing colored output
- Added `DevResult` and `StartResult` type exports to contract