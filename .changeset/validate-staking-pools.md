---
"api": minor
"ui": patch
---

Validators must be approved staking pools. Saving a NEAR validator, changing its account, network or protocol, making it the default, or provisioning a community with a pool checks NEAR's staking pool whitelist (`is_whitelisted`, configured per network as `mainnetStakingPoolWhitelist` and `testnetStakingPoolWhitelist`) and is refused when the account isn't approved or the check can't complete. A new public `getStakingPoolApproval` route reports approval. `/stake` and the Node sequence's team direct stake re-check the pool before anyone signs, and validator lists flag saved entries that aren't approved pools.
