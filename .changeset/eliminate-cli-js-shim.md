---
"everything-dev": minor
---

Eliminate cli.js shim — bin entry points directly to dist/cli.mjs

The `cli.js` shim was a dual-purpose entry that fell back between `dist/` and `src/`, creating a shebang conflict (npm needs `#!/usr/bin/env node`, Bun needed `#!/usr/bin/env bun` for TS). This caused `bunx everything-dev upgrade` to fail with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` because Node can't strip TS from node_modules.

- Delete `cli.js` — the shim is eliminated
- `src/cli.ts` shebang → `#!/usr/bin/env node` (tsdown carries it to `dist/cli.mjs`)
- `bin.bos` → `dist/cli.mjs` (Node-compatible, no fallback needed)
- Root scripts → `packages/everything-dev/src/cli.ts` (Bun handles TS natively)
- CI workflows → `packages/everything-dev/src/cli.ts`
- `init.ts` rewrite rules updated for new script paths
