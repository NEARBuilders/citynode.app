---
"everything-dev": patch
---

Add consumer-friendly workflow templates (`.templates/`), remove AGENTS.md and API config from sync exclude, add `routes` to plugin schema

**Workflow templates:**
- `.templates/.github/workflows/release-sync.yml` — consumer build/deploy/publish pipeline (no monorepo-specific steps)
- `.templates/.github/workflows/ci.yml` — consumer lint/typecheck/docker workflow
- `.templates/.github/dependabot.yml` — consumer dependency updates
- `.templates/` prefix is stripped on copy so files land at correct paths

**Sync exclude changes:**
- Removed `AGENTS.md` — synced on upgrade, user can merge or revert
- Removed `api/drizzle.config.ts`, `api/tsconfig.json`, `api/tsconfig.contract.json` — replaced/merged on upgrade
- Only `api/src/contract.ts`, `api/src/index.ts`, `api/src/db/schema.ts` remain protected (core business logic)

**Schema:**
- Added `routes` field to `BosPluginRefSchema` — each plugin can declare route patterns it owns
