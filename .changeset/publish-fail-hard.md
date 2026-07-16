---
"everything-dev": patch
---

Fix dead code in CLI publish/deploy error handlers (generic error check fired before specific handlers, hiding per-workspace failure details). Surface build errors as `warnings` in `WorkspaceDeployResult` when Zephyr deploys successfully with non-zero exit code. Tighten Zephyr error regex from `/ZE\d+/` to `/ZE\d{4,}/` to avoid false positives. Preserve original error context when retrying workspace builds. Reorder deploy URL check before ZE error check for more reliable detection.
