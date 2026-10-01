---
"everything-dev": patch
---

Fix folder-form plugin UI dev wiring: a local plugin's associated `ui` development entry was stripped during config resolution (only entries with a nested bos.config.json kept local paths), so the dev harness never allocated a UI port or passed `BOS_UI_PORT` — the plugin's UI rsbuild then auto-ported into the plugin API's port and MF chunk loads returned HTML. A local plugin's associated ui now keeps its local development whenever the plugin entry itself resolves locally. Also declares the agents plugin (with its folder-form ui) in the authored citynode descriptor.
