---
"everything-dev": patch
---

Fix `asComposableEntry` crash when extends targets a config path (e.g. `#plugins.myplugin` or `#app.auth`) that doesn't exist in the parent config. Previously threw "Expected config entry object, received undefined"; now treats the missing entry as an empty merge, so child-only values stand alone.
