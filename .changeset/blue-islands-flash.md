---
"everything-dev": patch
---

Fix `bos upgrade` to create missing catalog entries for tool packages (rspack, rsbuild, module-federation). Previously `updateRootCatalogVersion` skipped packages not already in the catalog, causing `catalog:` refs to resolve to nothing and `bun install` to fail with "failed to resolve" errors.