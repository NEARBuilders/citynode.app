---
"every-plugin": minor
---

Add automatic plugin-aware log annotations via `Effect.annotateLogs({ plugin: plugin.id })` when initializing plugins, so all logs within a plugin's lifecycle (including database migrations) are tagged with the plugin's registry key.

Rename `DatabaseTag` identifier from `"api/Database"` to `"Database"` for generic correctness across API and plugin contexts.
