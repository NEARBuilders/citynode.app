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
| `publication` | admin browser, after the registry serves the DAO's config | DAO proposal ID while a vote is open |

Recording a step does not change `updatedAt`, so the admin's optimistic version stays valid. A completed step is never downgraded, and repeating a step writes nothing. `markApplied` completes the application. The admin proposal page and the applicant's `/apply` status show these steps from the saved record.

A failed apply (`applyStatus: failed`) and one left `applying` for more than five minutes (`applyTimedOut`) appear on the admin Proposals **Pending** tab with a "Setup failed" or "Setup stalled" badge. **Resume** goes through `approve`, which accepts only those two states and compares `updatedAt`, so only one of several concurrent resumes proceeds. The resumed run reuses the organization and node, then checks publication before proposing anything to the DAO:

1. If the registry already serves the expected domain and title, publication is recorded as complete.
2. Otherwise, if the DAO has an open `__fastdata_kv` proposal, publication is recorded as waiting on that proposal and setup stops until the DAO votes. No second DAO proposal is created.
3. If the registry or the DAO's proposals cannot be read, setup stops without publishing.
4. Only when the config is unpublished and no DAO proposal is open is a new one submitted.

If the final `markApplied` write fails, the browser records the failure so the application can be resumed immediately; the resumed run finds every step complete and only finalizes it. Trezu may show the executed FastKV proposal as failed because the namespace account has no contract; the registry check is what counts.
