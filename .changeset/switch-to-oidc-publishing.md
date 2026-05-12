---
"everything-dev": patch
---

Switch npm publishing from NPM_TOKEN to OIDC trusted publishing

- Add `id-token: write` permission for OIDC token generation
- Remove `NODE_AUTH_TOKEN` / `NPM_TOKEN` from publish steps — npm CLI ≥11.5.1 auto-detects OIDC
- Fix `cli.js` shebang from `#!/usr/bin/env bun` to `#!/usr/bin/env node` so npm accepts the bin entry (npm auto-corrected/removed bin entries with non-node shebangs)

One-time manual step required: configure trusted publisher on npmjs.com for both `every-plugin` and `everything-dev` (Settings → Trusted Publisher → GitHub Actions → NEARBuilders/everything-dev → release.yml).
