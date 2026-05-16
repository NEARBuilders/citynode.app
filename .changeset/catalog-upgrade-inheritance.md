---
"everything-dev": patch
---

Update `bos upgrade` to sync inherited catalog entries from the full root `bos.config.json` extends chain, preserve child-only catalog entries, and rewrite matching workspace dependencies to `catalog:`. This also writes fully derived composable/plugin config into the resolved BOS config artifact so generated build state matches the final merged runtime config.
