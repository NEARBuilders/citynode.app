---
"everything-dev": minor
---

Add plugin-owned routes via `routes` field in `bos.config.json`, protect user-owned files on upgrade, resolve `catalog:` refs

**Plugin routes:**
- Each plugin in `bos.config.json` can declare a `routes` array (e.g. `"routes": ["ui/src/routes/_layout/apps/**"]`)
- During init, only routes for selected plugins are copied
- During sync, routes are dynamically included/excluded based on the child project's plugin config
- Removed plugin-owned routes from `.templatekeep` — they're now managed via `routes`

**Upgrade protection (`.templatesync-exclude`):**
- `ui/src/components/**` and `ui/src/styles.css` — never overwritten
- `ui/src/routes` — managed dynamically via plugin `routes`; removed blanket `ui/src/routes/**` exclude so enabled plugin routes can sync
- `api/src/contract.ts`, `api/src/index.ts`, `api/src/db/schema.ts` — core business logic protected
- `api/drizzle.config.ts`, `api/tsconfig.*` — project-specific config protected
- `api/package.json`, `api/plugin.dev.ts`, `api/rspack.config.js` now syncable on upgrade (with package.json merge)

**`catalog:` resolution:**
- `resolveCatalogRefs: true` during init — `catalog:` version refs are resolved to actual versions so consumer projects don't need a workspace catalog
