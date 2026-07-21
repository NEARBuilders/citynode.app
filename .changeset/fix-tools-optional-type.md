---
"every-plugin": patch
"api": patch
---

Fixed `tools` parameter type in plugin `initialize` — it was incorrectly typed as optional (`tools?:`) but is always provided by the plugin runtime. Child repos no longer need `tools!.buildService()` workarounds.
