---
"ui": minor
---

Remove opencode plugin and related UI routes

### What Changed

- **Deleted** `plugins/opencode/` — the opencode plugin is no longer part of the project
- **Deleted** `ui/src/routes/_layout/opencode.tsx` — removed the `/opencode` route page
- **Updated** `ui/src/routes/_layout/_authenticated/_admin/dashboard.tsx` — replaced opencode-specific server/prompt tabs with a simple admin placeholder
- **Updated** `ui/src/routes/_layout/about.tsx` — removed the `/opencode` link
- **Updated** `ui/public/llms.txt` and `ui/public/skill.md` — removed `/opencode` from public paths
- **Updated** `AGENTS.md` and `CONTRIBUTING.md` — removed opencode plugin references
- **Updated** `bos.config.json` — removed the `opencode` plugin entry
