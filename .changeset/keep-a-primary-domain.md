---
"api": patch
---

Removing a tenant's primary domain while it has other domains now returns `CONFLICT` "Make another domain primary before removing this one" instead of deleting it and leaving the tenant with no primary domain. Removing a non-primary domain, or the tenant's only domain, works as before.
