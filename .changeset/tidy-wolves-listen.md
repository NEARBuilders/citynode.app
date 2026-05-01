---
"everything-dev": patch
---

Add helpful merge guidance to upgrade and sync output, use `.templates/` directory for consumer workflows

**Upgrade/sync output:**
- "Upgrade successful" with categorized guidance: never overwritten (safe), replaced (review), merged (deps preserved), skipped (already yours)
- Sync output includes similar review prompt when files are updated

**Consumer workflow templates (`.templates/`):**
- `release-sync.yml` — build, deploy, publish, Docker (no monorepo-specific steps)
- `ci.yml` — lint, typecheck, Docker build
- `dependabot.yml` — dependency updates
- `.templates/` prefix stripped on copy so files land at correct paths

**Sync exclude refinements:**
- Removed `AGENTS.md`, `api/drizzle.config.ts`, `api/tsconfig.*` from exclude — these are replaced/merged on upgrade
- Only core business logic remains protected: `api/src/contract.ts`, `api/src/index.ts`, `api/src/db/schema.ts`
