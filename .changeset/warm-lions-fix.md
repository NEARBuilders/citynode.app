---
"everything-dev": patch
---

Fix `bos init` to always set `postinstall` and `types:gen` scripts in scaffolded projects

Previously `postinstall` was only set if the source `package.json` already had it, and `types:gen` was never rewritten from the monorepo path. This caused scaffolded projects to have missing or broken type generation, leaving `.gen.ts` stubs empty and breaking `rsbuild`/`rspack` startup when `bun install` failed silently.

- `postinstall` is now unconditional: `node_modules/.bin/bos types gen || true`
- `types:gen` script is now always added: `node_modules/.bin/bos types gen`
- `|| true` prevents a failing type gen from blocking `bun install` completion
