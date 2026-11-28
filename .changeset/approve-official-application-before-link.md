---
"api": patch
---

`approveOfficialApplication` now approves the application before it links the community's DAO, so a concurrent decline or edit can no longer leave a community linked and official under an application that was never approved. Every check that can refuse (the application's state, the community, a different DAO already linked) runs first and changes nothing. If linking fails after the approval, the error says so and calling `approveOfficialApplication` again on the approved application finishes the job; an application that is already approved and fully linked is a no-op, and a different DAO is still refused.
