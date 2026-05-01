---
"everything-dev": minor
---

Add `bos sync`, `bos upgrade`, and `bos status` commands; redesign `bos init` prompts

**New commands:**
- `bos sync` — Sync template files from parent project with hash-based change detection, file backup, and local exclusion support
- `bos upgrade` — Upgrade `everything-dev` and `every-plugin` packages from npm, then auto-sync template files
- `bos status` — Show project health: extends ref, package versions, update availability, last sync time, .env status, parent reachability

**Breaking changes to `bos init`:**
- `account` → `extendsAccount` (parent NEAR account)
- `gateway` → `extendsGateway` (parent gateway)
- `name` → `account` (new project's NEAR account)
- `destination` → `directory` (target directory)
- Prompt order changed: domain first, then account/directory auto-derived from domain, extends shown last
- Validates extends reference on-chain before downloading tarball
- Writes `.bos/sync-snapshot.json` for future sync baseline

**Other improvements:**
- `.templatesync-exclude` defines user-owned files (routes, api contract, db schema) that sync never overwrites
- `.bos/sync-local-exclude` lets projects add their own sync exclusions
- Sync backs up files to `.bos/sync-backup/` before overwriting
- `.bos/sync-snapshot.json` unignored from `.gitignore` for team sharing
- Init next steps now show `cp .env.example .env` and `bun run dev`
