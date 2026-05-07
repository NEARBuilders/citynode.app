---
"everything-dev": patch
---

Fix `resolveWorkspaceTarget` to respect `development` path for app entries.

Previously, app entries (host, ui, api, auth) were hardcoded to `${configDir}/${key}`, ignoring the `development` field in `bos.config.json`. This caused the auth plugin to be skipped during deploy because it lives at `plugins/auth/` rather than the workspace root.

Now, if an app entry has a `development` field (e.g., `"local:plugins/auth"`), the path is resolved correctly before falling back to the hardcoded root path.
