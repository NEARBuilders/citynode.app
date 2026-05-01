---
"everything-dev": minor
---

Redesign `bos init` flow and improve `bos sync`/`bos upgrade` safety

**Init prompt redesign:**
- Domain is now the first prompt
- Single "Extend from" field accepts `account/gateway` format (e.g. `dev.everything.near/everything.dev`) instead of separate prompts
- Plugin selection prompt with toggle-by-number UI; only `_template` is selected by default, `registry` is opt-in
- Directory defaults to full domain name (e.g. `sample.com`)
- Output shows relative directory path instead of absolute

**Plugin handling:**
- Only selected plugins are copied, configured in `bos.config.json`, and included in workspaces
- `bos sync` filters plugin files based on the child project's `bos.config.json` plugins list
- `plugins/registry/**` removed from `.templatekeep`; `plugins/_template/**` is the only plugin carried by default

**Sync/upgrade safety:**
- `.templatesync-exclude` now protects all API config files: `drizzle.config.ts`, `package.json`, `plugin.dev.ts`, `rspack.config.js`, `tsconfig.json`, `tsconfig.contract.json`
- `.github/workflows/**` added to `.templatekeep` so CI workflows carry forward
- `.gitignore` added to `.templatekeep`
