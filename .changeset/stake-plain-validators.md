---
"ui": minor
"api": minor
---

The stake page lists a community's own validators, default first. When it has none, it shows the nearest ancestor's validators, labelled "Stake via {name}" (Kuala Lumpur shows Malaysia's pool). A country no longer picks up a city's validator from below it. `stakeable` on `listStakeCommunities` now means the community has its own validator. New `listNodeAncestors` read lists a community's ancestors nearest first. Removed `resolveStakingValidators` and `stakingValidators` on `getNodeSummary`.
