---
"everything-dev": patch
---

Remove duplicate `zod` from `dependencies` (already in `peerDependencies`). Add `@tanstack/router-plugin>zod` override to root `package.json` so the TanStack Router plugin resolves `zod` v3 instead of the hoisted v4 during build.
