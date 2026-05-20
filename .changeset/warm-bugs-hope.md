---
"everything-dev": patch
---

Fix `bos types:gen` to handle remote plugins that only have a `production` URL (no `development`). Plugin contract fetch failures no longer crash the entire type generation — failed plugins are reported and skipped, and the command shows per-plugin fetched/skipped/failed status instead of only API-level status.