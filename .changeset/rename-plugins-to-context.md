---
"api": patch
"everything-dev": patch
---

Rename `api/src/lib/plugins.ts` to `api/src/lib/context.ts`. Extract `ContextSchema` as a shared Zod schema with derived `Context` type, replacing the inline schema in `createPlugin`. Add old path to `OBSOLETE_FILES` in upgrade.
