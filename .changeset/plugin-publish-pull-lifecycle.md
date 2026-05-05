---
"everything-dev": minor
"api": minor
"ui": minor
"host": minor
"@everything-dev/registry-plugin": minor
"@everything-dev/projects-plugin": minor
"@everything-dev/opencode-plugin": minor
---

Renamed `productionIntegrity` to `integrity` across all schemas, build configs, and `bos.config.json`. Added `name` and `version` fields to `BosPluginRef`. Enhanced `bos plugin add` with `bos://account/plugins/name` registry resolution, manifest validation, and automatic integrity computation. Enhanced `bos plugin publish` with manifest validation, integrity computation, and FastKV plugin registry writes. Added generic KV routes (`kvGet`, `kvList`, `kvPrepareWrite`, `kvRelayWrite`) to the registry plugin.
