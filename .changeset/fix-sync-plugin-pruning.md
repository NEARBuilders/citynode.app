---
"everything-dev": patch
---

Fix `bos sync` and `bos upgrade` so child `bos.config.json` files keep their existing local root metadata instead of inheriting parent-only fields during template reconciliation. This also prunes stale unresolved plugin entries before runtime type generation, removing spurious `[API Contract] Skipping plugin ... no URL resolved` warnings, and cleans the synced CI workflow by dropping the obsolete integration-test job and gating Docker builds at the job level.
