---
"everything-dev": minor
---

Plugin workspaces follow the strict App-shape layout: `bos types gen` reads plugin contracts from `plugins/<id>/api/src/contract.ts` (auth's export surface included), emits `plugins-client.gen.ts` / per-plugin `auth-types.gen.ts` into `plugins/<id>/api/src/lib/`, and points `auth-types.gen.ts` contract imports at the resolved local contract source instead of the stale `.bos/generated/auth/` mirror. Sync owns `api/bos.dev.ts` and plugin `api/src/{lib,db}` destinations; stale `rspack.config.js` sync machinery is deleted outright (the every-plugin composition is the only build path). The upgrade codemod path is frozen — it retires with the sync machinery (plan 028), not maintained for the layout change.
