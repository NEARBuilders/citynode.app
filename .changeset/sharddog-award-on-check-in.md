---
"api": minor
"ui": minor
---

Checking in at an event now earns ShardDog collectibles. When an organizer's check-in sync records a check-in, the person gets that event's ShardDog and, on their first check-in in the community, the community's membership ShardDog, each only once. Awards go to the NEAR account the check-in was made with; anyone checked in without one is held until #605's claim links. If ShardDog fails, check-in still succeeds and the award stays pending: the next sync, or the person opening their attendance, retries it with a growing wait between attempts. `getMyCollectibles` lists the caller's collectibles, and the attendance record shows a "View in ShardDog" link next to each awarded badge. Migration 0023 adds `sharddog_awards` and an `account_id` column on `attendance_check_ins`. Part of #602.
