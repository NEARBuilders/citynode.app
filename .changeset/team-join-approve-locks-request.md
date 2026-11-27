---
"api": patch
---

Approving a team join request now locks the pending request, adds the member upstream, and records the approval in one transaction. A decline or withdraw that arrives while the approval is still adding the member waits for it and is then refused, so team membership always matches the request's final status. If the upstream add fails, the transaction rolls back and the request stays pending as before. `settle` can no longer record an approval without adding the member.
