---
"ui": patch
---

The node sequence House of Stake vote steps now read the team's veNEAR proof and voting power from an archival node at the proposal's snapshot block, so the proposed `vote` call passes vote.dao's snapshot check. Propose stays blocked while that read is pending or has failed, and the step says "No voting power at snapshot" when the team had none. Pending DAO proposals are now read across the whole proposal period, and a failed read blocks Propose instead of looking like "no pending proposals".
