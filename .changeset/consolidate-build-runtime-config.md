---
"everything-dev": patch
---

Consolidate `buildRuntimeConfig` into single canonical implementation in config.ts

The `repository` field from `bos.config.json` was missing from the browser runtime config because `app.ts` had a duplicate `buildRuntimeConfig` that omitted it. This consolidates the two implementations into one, eliminating field drift risk. Also fixes integrity/ssrUrl to be source-based rather than only env-based.
