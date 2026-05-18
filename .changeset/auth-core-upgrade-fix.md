---
"everything-dev": patch
---

Pin `@better-auth/core` alongside the Better Auth client packages and teach `bos upgrade` to add the missing catalog ref in child workspaces while resyncing stale `shared.ui` auth versions from the catalog. This prevents duplicate Better Auth core installs from breaking generated auth client plugin types after init or upgrade.
