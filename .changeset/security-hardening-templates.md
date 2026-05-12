---
"everything-dev": minor
---

Harden template workflows and eliminate Renovate config drift

Template CI and release-sync workflows now match the security posture of live workflows: SHA-pinned GitHub Actions, `--ignore-scripts` on bun install, `permissions:` at job/top level, dependency review, `bun audit` (fails on critical/high), secrets scoped to step-level `env:`, and `id-token: write` removed.

`.github/renovate.json` is now a symlink to `.github/templates/renovate.json` — single source of truth, no drift possible.

`bos upgrade` will clean up `.github/dependabot.yml` and `.github/templates/dependabot.yml` from child projects (added to `OBSOLETE_FILES`).

`bos sync` now treats `.github/renovate.json` and `.github/workflows/ci.yml` as framework-owned files (always overwritten on sync).
