---
"everything-dev": minor
---

Follow the strict plugin layout: `bos types gen` reads plugin contracts from `plugins/<id>/api/src/contract.ts` (auth's export surface included), emits `plugins-client.gen.ts` / per-plugin `auth-types.gen.ts` into `plugins/<id>/api/src/lib/`, and points `auth-types.gen.ts` contract imports at the resolved local contract source instead of the stale `.bos/generated/auth/` mirror. `bos upgrade` codemods target `plugins/*/api/src/index.ts`; sync owns `api/bos.dev.ts` and plugin `api/src/{lib,db}` destinations (drizzle.config.ts sync dropped — plugin paths now diverge from api's).
