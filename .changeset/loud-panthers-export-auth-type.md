---
"everything-dev": patch
"ui": patch
---

Export `Auth` type from generated auth-types.gen.ts for inferAdditionalFields

The `auth-types.gen.ts` file now re-exports `Auth` from better-auth so
the UI can use `inferAdditionalFields<Auth>()` instead of
`inferAdditionalFields<typeof createAuthInstance>()`.
