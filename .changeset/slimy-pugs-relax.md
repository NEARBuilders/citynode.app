---
"everything-dev": patch
---

Fix first publish failure: wrap FastKV verification in try/catch so a valid txHash is accepted as proof of success when config doesn't exist yet on-chain
