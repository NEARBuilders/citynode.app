---
"ui": patch
---

The Team stake card reads its pool's owner, fee, paused flag and validator status, and explains when the DAO's stake isn't earning: another account runs the pool (with its fee), the fee is 100%, staking is paused, or the pool isn't validating or is only joining. Propose unstake is hidden in those states and while the pool's status can't be read; withdrawing an unlocked balance is unaffected. A linked DAO with no pool now says so instead of asking to link a treasury.
