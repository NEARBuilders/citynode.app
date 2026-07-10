---
"everything-dev": patch
---

feat(everything-dev): mark framework-owned files with header warnings

- Added `api/src/lib/context.ts` to `FRAMEWORK_OWNED_SYNC_FILES` so it gets
  synced by `bos sync` / `bos upgrade`
- Added "BE CAREFUL MODIFYING THIS FILE" header comments to 12 framework-owned
  source and build config files, directing users to upstream changes at
  https://github.com/nearbuilders/everything-dev
