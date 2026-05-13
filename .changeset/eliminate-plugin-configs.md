---
"everything-dev": minor
---

Eliminate per-plugin `bos.config.json` files. All plugin metadata (secrets, variables, routes, sidebar, production URLs) now lives directly in root `bos.config.json` under `plugins.<key>`. Plugin rspack configs write deployment URLs to root config. `extends` support remains for cross-app composition. `bos upgrade` migrates plugin configs into root and deletes them.
