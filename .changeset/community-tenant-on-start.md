---
"api": minor
---

Starting a community now creates its tenant and links the node to it, so its owner can open My community and `/report`. A migration backfills a tenant for every existing community that has none. These tenants are platform-owned, keyed by a placeholder account `<place-slug>.v1.citynode.near` with no NEAR account behind it, and the account id can be changed later with `updateTenant`. Validators still wait until the community is official.
