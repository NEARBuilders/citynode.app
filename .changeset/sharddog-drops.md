---
"api": minor
"ui": minor
---

Communities can link ShardDog drops: one membership drop for the community and one drop per event. Community owners and admins (and platform admins) set or clear them in a new "ShardDog collectibles" section on the community settings page; anyone can read them through `getShardDogDrops`, and only owners and admins can change them through `setShardDogDrop`. A new ShardDog client module awards a drop to a NEAR account and creates one-time claim links. It is off unless the `sharddogEnabled` variable is set, and it is a stub that makes no network calls until `SHARDDOG_API_KEY` is configured. Migration 0022 adds the `sharddog_community_drops` and `sharddog_event_drops` tables. Part of #602.
