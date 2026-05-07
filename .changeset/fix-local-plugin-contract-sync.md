---
"everything-dev": patch
---

Fix `syncApiContractBridge` to correctly include local plugins in generated contract types. Previously, plugins with `local:` development paths were skipped because the sync script checked `!plugin.url` — but local plugins intentionally have empty URLs. The guard now checks `!plugin.url && !plugin.localPath`, allowing the contract sync to read `src/contract.ts` directly from disk for locally-developed plugins.
