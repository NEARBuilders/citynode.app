---
"api": patch
"everything-dev": minor
---

Removed the pglite URL validation guard on `API_DATABASE_URL` in production. Added `tsconfig.json` and `tsconfig.contract.json` to the plugin sync template, so plugin tsconfigs are now framework-owned and synced during `bos sync`.
