# Community application policy

The applicant is the primary NEAR account in the authenticated session. A community application is eligible only when that account appears explicitly in a `Group` role in the proposed Sputnik DAO's `get_policy` result on the account's NEAR network. `Everyone` roles do not qualify. The application must belong to the session's active organization.

The server validates the node payload and writes the applicant account into `submitterAccountId`. A supplied value must match the session. The first application for a slug creates its proposal. While it is pending, approved, removed, or being applied, it cannot be revised. After rejection, the original applicant may revise the same slug; another applicant cannot claim it. A repeated request using the same idempotency key returns the existing proposal without another submission.

Applicants can read their own proposals through `getMyNodeApplications`, including review status, apply status, rejection reason, and application payload. Other applicants cannot use that endpoint to read them.
