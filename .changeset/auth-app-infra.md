---
"everything-dev": minor
"host": minor
---

Move auth from plugin to app-level infrastructure with oRPC contract generation

Auth is now `app.auth` in bos.config.json instead of `plugins.auth`. The host loads the auth plugin as Phase 0 (app-level infrastructure) before other plugins. Session resolution and auth HTTP handler are provided through the auth plugin's oRPC client and initialized context, eliminating direct Better Auth coupling in the host. The `syncApiContractBridge` now generates typed auth contract clients in `api/src/plugins-client.gen.ts` and `ui/src/api-contract.gen.ts`, enabling plugins to call auth routes via `services.plugins.auth()` instead of importing the raw `Auth` type.
