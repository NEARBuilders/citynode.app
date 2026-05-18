---
"everything-dev": patch
---

Simplify generated child workflows down to `CI` and `Publish`, and split the parent repo's package release flow from runtime publish/deploy. Parent package staging now publishes all non-private `/packages/*` workspaces instead of hardcoding framework package names.
