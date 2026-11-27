---
"api": patch
---

ShardDog awards no longer get stuck. A NEAR account linked after check-in is attached to badges that have no claim link yet when the person opens their attendance, and sync re-reads check-ins from the last 14 days while a badge has neither an account nor a claim link. Failed awards to a NEAR account keep retrying, at most an hour apart, instead of stopping after 20 attempts. Claim links still stop after 20. A corrected drop id is retried within a minute, and awards that have never been tried go ahead of ones that keep failing. One run now sends every due award, not only the first 50, unless a whole batch fails. Communities with thousands of check-ins no longer fail to queue awards, and a drop replaced or removed during a run is no longer sent.
