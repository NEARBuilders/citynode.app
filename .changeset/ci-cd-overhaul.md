---
"everything-dev": patch
"every-plugin": patch
---

Overhaul CI/CD workflow architecture: switch from `workflow_run` triggers to `repository_dispatch` chain to eliminate skipped runs, sequence Deploy after Release+Docker to prevent stale Railway redeploys, gate Docker on actual npm publishes, move framework tests from Release to CI with path-based filtering, add Playwright browser caching, fix unsafe `git rebase -X theirs` in deploy/staging retries, and remove duplicate GitHub release creation from Deploy.
