---
"api": patch
---

ShardDog awards no longer get stuck. A NEAR account linked after check-in is attached when the person opens their attendance, and recent events' check-ins are re-read on sync until the account is known. Failed awards keep retrying, at most an hour apart, instead of stopping after 20 attempts. A corrected drop id is retried within a minute, and awards that have never been tried go ahead of ones that keep failing. One run now sends every due award, not only the first 50, unless a whole batch fails. Communities with thousands of check-ins no longer fail to queue awards, and a drop replaced or removed during a run is no longer sent.
