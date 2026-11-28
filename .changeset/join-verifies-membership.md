---
"api": patch
---

`joinCommunity` no longer decides a person is already a member because the join-code error mentions the word "already". When redeeming the community's join code fails, it checks the caller's actual membership: a member is told they have already joined, and anyone else gets the failure, so a used-up or revoked code can't report a false success.
