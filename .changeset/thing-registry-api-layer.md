---
"api": minor
"@every-plugin/template": minor
"ui": minor
"everything-dev": patch
---

Simplify API to a thin orchestration layer: replaces the upvotes table with a `things` registry (`thingId`, `pluginId`, `createdAt`, `updatedAt`), adds Effect service layers (Registry, Votes), and introduces plugin dispatch via `getThingProvider()` so the API delegates to plugins by `pluginId`. Adds `createThing`, `getThing`, `deleteThing` (admin-only), `subscribeThings` endpoints with SSE filtering by `pluginId`/`type`/`action`. Adds `deleteThing` to `_template` plugin contract/service/handler. Extracts `ApiContextSchema`, `pluginContext`, `runEffect` into `lib/context.ts`. Renames service files `thing-registry`→`registry`, `thing-votes`→`votes` with matching symbol renames. Removes obsolete `lib/plugins.ts`. Adds frontend thing registry routes under `/things/` (index, create, detail with vote controls, admin delete, live SSE stream). Improves DB Layer with idempotent migrator. Updates api-and-auth and plugin-development skill docs.
