---
"api": patch
---

`updateTenant` to an `accountId` another tenant already uses now returns `CONFLICT` "Tenant with this accountId already exists" (declared in the contract) instead of a 500 carrying the raw SQL and constraint text.
