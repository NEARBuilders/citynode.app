---
"everything-dev": patch
---

Normalize generated child root `package.json` files for app repos, including child-specific scripts and removal of parent-only manifest fields. Child workflow templates now use a `CI` -> `Packages Release` -> `Release` flow, preserve empty `plugins/*` workspace overrides during sync, and pin reusable release deploys to the CI-validated commit SHA.
