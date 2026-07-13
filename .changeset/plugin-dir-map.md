---
"everything-dev": patch
---

Fix `bos init` plugin file copy when plugin key differs from directory name

- `buildInitPatterns` now accepts a `pluginDirMap` to resolve plugin keys to actual directory names
- During init, the plugin's `development` field from parent config is inspected to detect when the on-disk directory name differs from the plugin key (e.g. `template` key → `_template` directory)
