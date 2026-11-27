---
"api": patch
"ui": patch
---

Tenant status changes are now guarded. Only a platform admin can reactivate a tenant, and `reactivateTenant` activates a `pending` tenant, lifts a suspension, or restores a tenant pending deletion and clears its deletion timestamp; any other status returns `CONFLICT`. `suspendTenant` only applies to `active` or `pending` tenants: suspending a tenant pending deletion returns `CONFLICT`, and suspending a suspended tenant is a no-op. `updateTenant` no longer accepts `status`. The Reactivate button is shown to platform admins only, and the suspend dialog now says a platform admin reactivates the site.
