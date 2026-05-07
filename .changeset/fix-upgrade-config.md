---
"everything-dev": patch
---

Fix `bos upgrade` destroying local `bos.config.json` and crashing on missing plugin directories

- Guard `syncApiContractBridge` against empty plugin URLs when local directories are missing and no production URL is configured, preventing `fetch() URL is invalid` crashes
- Make `syncTemplate` merge `bos.config.json` instead of overwriting, preserving local key order and values
- New template keys are inserted before the canonical trailing group (`app`, `plugins`, `shared`) with `shared` always last
- `extends` is always preserved as the first key
- `personalizeConfig` now respects `mode: "sync"` to avoid stripping `production`, `integrity`, `ssr`, and `ssrIntegrity` during upgrades