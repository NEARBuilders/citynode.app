---
"everything-dev": patch
---

Fix auth-types.gen.ts fallback when auth plugin is remote or missing locally

Previously `auth-types.gen.ts` always fell back to `plugins/auth/src/auth-export.ts` regardless of whether that file existed, causing typecheck errors in projects without a local auth plugin. Now uses a three-tier fallback: (1) local `plugins/auth/src/auth-export.ts` if it exists on disk, (2) cached `.bos/generated/auth/auth-export.d.ts` from a previous remote fetch, (3) `better-auth` stub as final fallback. Once the auth plugin includes `additionalExports` in its manifest, the remote fetch path will also resolve automatically.
