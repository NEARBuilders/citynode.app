---
"api": minor
"ui": minor
"@everything-dev/proposals-plugin": minor
---

Lifecycles that were spread across loose flags and duplicated checks now each have one explicit definition.

- Tenants move through one transition table: delete only from active, suspend from active, reactivate from suspended or pending, and a new owner-only restore from pending deletion. A refused transition answers `CONFLICT`. Org owners can suspend and reactivate, as the UI already offered. `updateTenant` no longer accepts `status` and rejects it instead of silently dropping it.
- Proposals: only the original submitter can re-propose. Without a context policy, an author can still edit a pending proposal, but nothing approved or applied can be reset. Proposal stream `action` is an enum, and starting a removal publishes `remove_started`.
- Every proposal view (admin, applicant, community dashboard) shows the same phase from one resolver, including "Waiting for DAO vote" and "Setup stalled" for applicants.
- An expired DAO vote no longer blocks resuming a community setup.
- Approving a community creates a verified `slug.<gateway>` binding, so the host serves it; existing ones can be verified without DNS.
- Team join approval is claimed before the member is added upstream, so a concurrent withdrawal can't leave someone added to a request that reads withdrawn.
- A cancelled Luma import stays cancelled through syncs and withdrawals, and discovery lists, stats and event pages share one visibility rule.
- Expired invitations show as expired, an org with no status counts as active (matching the server), and several smaller UI races are fixed: amounts typed into the team pool dialog, the relayer wallet prompt, editors flashing old values after save, and DAO restore re-running every render.
