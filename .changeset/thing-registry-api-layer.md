---
"api": minor
"@every-plugin/template": minor
"everything-dev": patch
---

Simplify API to a thin orchestration layer: replaces the upvotes table with a `things` registry (`thingId`, `pluginId`, `createdAt`, `updatedAt`), adds Effect service layers (ThingRegistry, ThingVotes), and introduces plugin dispatch via `getThingProvider()` so the API delegates to plugins by `pluginId`. Adds `createThing`, `getThing`, `subscribeThings` endpoints with SSE filtering by `pluginId`/`type`/`action`. Updates `_template` with `createThing`/`getThing` provider methods. Improves DB Layer with idempotent migrator. Updates API-and-auth and plugin-development skill docs.
