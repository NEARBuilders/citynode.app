---
"everything-dev": minor
---

Add targeted `extends#path` support for composable app entries, move plugin provider metadata onto `plugins.<id>` entries, and migrate `bos init`/`bos upgrade` to the new plugin config shape. This also fixes local plugin path resolution during scaffolding so selected plugins are copied and wired correctly, including the no-plugins init path.
