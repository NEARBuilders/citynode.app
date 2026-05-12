---
"everything-dev": patch
---

Consolidate code generation into `generateCodeArtifacts` — single function replaces scattered `writeResolvedConfig`, `writePluginSidebarGen`, and `syncApiContractBridge` calls across all CLI handlers (dev, start, build, publish, init, sync, typesGen, pluginAdd, pluginRemove, pluginPublish). Fixes CI build failure where `publish --deploy` skipped sidebar generation.
