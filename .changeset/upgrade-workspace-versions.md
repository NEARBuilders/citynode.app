---
"everything-dev": patch
---

`bos upgrade` now bumps `every-plugin` and `everything-dev` in **all workspace `package.json`s**, not just the root. It also updates `peerDependencies` and `workspaces.catalog` while correctly skipping `workspace:*` and `catalog:` references.
