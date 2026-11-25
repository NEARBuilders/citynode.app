---
"api": minor
"ui": minor
---

People who check in without a NEAR account now get a one-time ShardDog claim link for each badge instead of waiting for an account. The link is made once per person and badge (the award id is the idempotency key), is only returned to that person by `getMyCollectibles` (status `claim`, with `claimUrl`), and the attendance record shows a "Claim in ShardDog" button with a note that it works once. Once a claim link is handed out it stays the way to collect that badge, even if a NEAR account shows up later, so nobody gets the same badge twice. Migration 0024 adds `claim_url` to `sharddog_awards`. Part of #602.
