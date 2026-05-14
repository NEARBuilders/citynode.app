---
"everything-dev": patch
---

Improve `bos init` prompt copy by renaming the local override question to customization language and adding a confirmation step that shows the parent app title and description when both are available.

Fix framework install resolution so `bos init` removes copied `bun.lock` files before install and `bos upgrade` uses `bun install --force`, preventing stale lockfile entries from downgrading `everything-dev` away from the intended version.
