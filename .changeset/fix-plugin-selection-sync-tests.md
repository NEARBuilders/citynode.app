---
"everything-dev": patch
---

Fix child plugin workspace selection during init and sync by replacing `plugins/*` with the concrete selected plugin workspaces and ensuring stripped plugin config is written back to `bos.config.json`.

Add integration coverage for real parent config personalization, plugin-owned file selection, and sync ownership rules so init/sync reliably preserve app-owned files while keeping framework-owned files in sync.
