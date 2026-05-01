---
"api": minor
"every-plugin": minor
"everything-dev": minor
"ui": patch
---

Enforce effect and zod as singleton shared dependencies across Module Federation runtime

- Add `effect` and `zod` as direct dependencies in api, host, and ui packages with catalog-pinned exact versions
- Move `every-plugin` from devDependencies to dependencies in api and ui (runtime import)
- Add `effect` and `zod` to `bos.config.json` `shared.ui` as singleton MF shared deps to prevent duplicate runtime instances
- Pin `effect`, `zod`, and `@orpc/*` to exact versions in workspace catalog and add overrides to eliminate version drift
- Unify `@orpc/*` version refs across api, host, and ui to use catalog instead of mixed ranges
- Update `every-plugin` mf-config to resolve effect/zod versions from installed packages instead of hardcoded ranges
- Merge `overrides` field in sync flow's `mergePackageJson` to preserve user overrides during upgrade
