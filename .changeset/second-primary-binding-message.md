---
"api": patch
---

`createBinding` with `isPrimary: true` on a tenant that already has a primary domain now returns `CONFLICT` "This tenant already has a primary domain. Add it as a secondary, then use setPrimaryBinding." instead of "Hostname already in use". `isUniqueViolation` can match a specific constraint.
