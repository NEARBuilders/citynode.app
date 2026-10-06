---
"ui": patch
---

Fix the sponsor stake stations failing with "connect the endowment in Trezu" even while the endowment was connected: the step runner threw for every endowment-signed step instead of falling through to the Trezu DAO signer, so the connected-endowment fallback could never sign.
