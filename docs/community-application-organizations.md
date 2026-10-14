# Community application organizations

New community applications carry no organization ID. The proposals plugin verifies that the signed-in primary NEAR account is an explicit member of the proposed DAO, records that account as `createdBy`, and stamps its authenticated user ID in the saved payload. A platform admin can approve without joining that DAO or connecting Trezu. The API reads the approved proposal itself before provisioning and uses the saved proposer identity; the browser does not choose the new organization or its members.

For a new application, approval reserves `community-<proposal ID>` as the organization ID and uses the approved community name and slug. The authenticated proposer is the organization owner. The first reviewing platform admin is an organization admin, giving them operational access without replacing the proposer as owner. If the same user is both proposer and reviewer, they remain owner. Organization insertion, memberships and default teams share one auth database transaction. A repeated call reuses the same organization and does not recreate memberships or teams someone later changes. A slug already held by another organization is a conflict that needs an explicit name/slug resolution.

Applications submitted under the older wizard keep their `orgId`. Approval verifies that the linked NEAR user requested or owns that organization. A pending organization request from the separate #269/#284 workflow is activated in this approval transaction, with its original name and slug retained. An already active legacy organization is reused. A rejected request, missing organization, foreign owner or organization linked to another application is a conflict. The separate organization-request review path still handles requests that have no community application; its personal-organization exemption remains unchanged.

The API creates the tenant, node and primary domain binding in one database transaction, all linked to the chosen organization. A repeated apply returns the existing node when one is linked to the proposal: first by the `communityProposalId` in the node's metadata, then by a live DAO tenant with the application's DAO account and organization. Names, slugs and hostnames are not compared, so a community or organization renamed between a failed apply and a retry is reused instead of becoming a conflict. Other existing resources are reported rather than adopted.

## Resumable setup

Approval moves a proposal to `approved`/`applying`. Each setup step is recorded on the proposal in `applySteps` while it is applying:

| Step | Recorded by | Resource |
| --- | --- | --- |
| `organization` | API, after the auth plugin provisions it | organization ID |
| `community` | API, after the tenant, node and binding exist | node ID |
| `publication` | admin browser: `started` before asking the DAO, `waiting` while a DAO vote is open, `completed` once the registry serves the DAO's config | DAO proposal ID while a vote is open |

Recording a step does not change `updatedAt`, so the admin's optimistic version stays valid, but it refreshes `applyActivityAt`. A completed step is never downgraded. Repeating a step writes no audit entry and only refreshes the activity time. Steps the admin's request records are credited to that admin in the audit log. `markApplied` completes the application. The admin proposal page and the applicant's `/apply` status show these steps from the saved record, and the admin page refreshes them every two seconds during a run.

A run counts as stalled (`applyTimedOut`) after five minutes without activity. While the browser waits on a DAO signature, it re-records `publication: started` every minute, so a slow Trezu signature is not mistaken for a stalled run. Each heartbeat also looks for an open DAO proposal; once one exists, it records `publication: waiting` with that proposal ID and stops, so the run shows "Waiting for DAO vote" and any admin can resume it after the vote. If the tab closes, the heartbeat stops and the run becomes stalled five minutes later.

A failed apply (`applyStatus: failed`) and a stalled run appear on the admin Proposals **Pending** tab (`lifecycleStatus: needs_review`) with a "Setup failed", "Setup stalled" or "Waiting for DAO vote" badge. Failed removals are not listed there, because the app has no removal flow to retry them. **Resume** goes through `approve`, which accepts only those two states and compares `updatedAt`, so only one of several concurrent resumes proceeds. The resumed run reuses the organization and node, then checks publication before proposing anything to the DAO:

1. If the registry already serves the expected domain and title, publication is recorded as complete.
2. Otherwise, if the DAO has an open `__fastdata_kv` proposal, publication is recorded as waiting on that proposal and setup stops until the DAO votes. No second DAO proposal is created.
3. If the registry or the DAO's proposals cannot be read, setup stops without publishing.
4. Only when the config is unpublished and no DAO proposal is open is a new one submitted.

If the final `markApplied` write fails, the browser records the failure so the application can be resumed immediately; the resumed run finds every step complete and only finalizes it. Trezu may show the executed FastKV proposal as failed because the namespace account has no contract; the registry check is what counts.

## Rejecting a failed setup

Rejecting an approved application whose setup failed first removes the resources it created, then rejects it, so the applicant can apply again with the same name and slug. Removal runs only for `applyStatus: failed`, and only for resources linked to the application:

- The tenant (with its node and domain binding) found by the application link is deleted, unless other communities are already under that node or the tenant has other nodes.
- The `community-<proposal ID>` organization (with its memberships, teams and invitations) is deleted only if its members are the applicant and the first reviewing admin, and it has no pending invitations or onboarding codes. An organization from a legacy application (`orgId`) existed before and is never deleted.
- Published DAO settings stay in FastKV; a later approval of the same application finds them in the registry.

If removal fails, the application is not rejected. Rejection clears the recorded setup steps.

## Launching a community

Approving a community application is the only way to launch a community. A platform admin who wants to launch one applies at `/apply` with the community's DAO, like any applicant, then approves the application under Admin → Proposals. When the admin is both proposer and reviewer they become the organization's only owner; otherwise the proposer is owner and the reviewing admin is an organization admin. Either way the organization gets the default Operations, Treasury and Community teams in the approval transaction, and the tenant, node, binding and DAO settings come from the same repeat-safe apply.

The former Admin → Sites → New site wizard is retired and `/admin/tenants/new` redirects to `/apply`. It attached every new site to the admin's active organization, so a second site was not reachable from that organization's community dashboard, the community's organizer never became owner, and it required the admin to be a DAO member, which approval does not (#323). The Sites list remains for managing existing sites and links to pending applications. The Home next step for platform admins and every My community empty state, including the one shown when no organization is selected, link to `/apply`.
