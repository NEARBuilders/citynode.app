---
"api": patch
---

`updateTenant` now refuses a request from anyone but a platform admin that sets `accountId`, `allowUiOverrides`, `allowBackendOverrides` or `allowSsr`, returning `FORBIDDEN` "Only platform admins can change a tenant's account or override settings". Community and tenant owners can still rename their tenant. This matches `createTenant`, which already limited these fields to platform admins, and closes a path where any owner could turn on server-side rendering of their bundle or point their tenant at another account.
