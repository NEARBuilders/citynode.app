---
"everything-dev": patch
"ui": patch
---

Stop overwriting CONTRIBUTING.md during `bos sync`/`bos upgrade`

Remove `CONTRIBUTING.md` from `FRAMEWORK_OWNED_SYNC_FILES` so user-customized
contributing guides survive sync and upgrade operations. It is still scaffolded
for new projects via `bos init`.

Also add a `DO NOT MODIFY` warning to `ui/src/app.ts` with guidance that imports
within the file must use relative paths (`./lib/...`), never `@/app`.
