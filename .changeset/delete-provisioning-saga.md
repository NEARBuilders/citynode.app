---
"ui": minor
"api": minor
"@everything-dev/proposals-plugin": minor
---

Removes the old community setup pipeline. Approving an Official Application now only links the DAO and approves it, so applications no longer have applying, failed or stalled setup states, and the admin Proposals pages and the applicant's `/apply` status drop the Resume action and setup progress. Removed API routes: `applyNodeProposal`, `applyCommunityProposal` and `releaseCommunityProposal`. The proposals plugin keeps propose, review, list, submissions and the event stream; `markApplied`, `markApplyFailed`, `recordApplyStep`, `remove`, `markRemoved`, `markRemoveFailed` and the `lifecycleStatus` filter are gone, and a migration drops the apply and removal columns. Applications still mid-setup go back to pending so an admin can approve or reject them. `getNodeDao` reads the DAO recorded on the community instead of its tenant's account; a migration copies the DAO of existing DAO-owned communities across.
