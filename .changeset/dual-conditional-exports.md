---
"everything-dev": minor
"every-plugin": minor
---

Rewrite package exports to dual conditional format (`development` → source, default → dist). Add `buildEverythingDevQuietly()` to CLI to ensure dist is built before workspace builds. Add missing tsdown entries for `every-plugin/orpc/client` and `every-plugin/orpc/openapi`. Add `prepublishOnly` and `customConditions: ["development"]` to all consumer tsconfigs. Move re-exported `@orpc/*` packages to `peerDependencies` in `every-plugin`.
