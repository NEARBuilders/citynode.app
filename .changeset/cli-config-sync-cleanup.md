---
"everything-dev": patch
---

Make child project config handling less confusing by showing the local `bos.config.json` by default in `bos config` and reserving `--full` for the fully resolved config. Also preserve existing child auth overrides during sync and upgrade, keep child catalogs aligned with the full extends chain, generate only relevant root scripts for each workspace shape, and base sync snapshots on the actual merged file content.
