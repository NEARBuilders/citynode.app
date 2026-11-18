# Official Applications

Anyone signed in can activate a place, which creates its community (see `CONTEXT.md`). An Official Application asks platform admins to make an already-activated community official by linking a Sputnik DAO to it. The proposals plugin only records the request and the review decision: `pending`, then `approved` or `rejected`.

## Who can apply

- The applicant is the primary NEAR account in the session. They must appear explicitly in a `Group` role in the proposed DAO's `get_policy` on that account's network; `Everyone` roles don't count.
- The server writes the applicant into `submitterAccountId`. A value sent by the client must match the session.
- An application is keyed by its place slug. While it is pending or approved it can't be revised. After a rejection the place is open again: the same applicant can revise it, or someone else can apply. Repeating a request with the same idempotency key returns the existing application.
- Applicants read their own applications, with review status, rejection reason and payload, through `getMyNodeApplications`. Nobody else can read them there.

## Approval

`approveOfficialApplication` is the only approval path. A platform admin calls it with the proposal ID, entity ID and the `updatedAt` they reviewed. The API:

1. Loads the application and refuses it unless it is still `pending` and unchanged since the admin loaded it.
2. Resolves the place's community. A place with no community yet is refused (`PRECONDITION_FAILED`); activate it first.
3. Refuses a community already linked to another DAO (`CONFLICT`), then makes the reviewing admin an admin of the community and links the DAO to it through the auth plugin (`linkDao`).
4. Makes the applicant an admin of the community too, unless they are already its owner or an admin (an applicant who activated the place stays its owner).
5. Copies the DAO account and network into the node's metadata, so signed-out visitors can read it through `getNodeDao` (anonymous callers can't read the community's auth record).
6. Approves the application.

Nothing else is created: no community, site, node or domain binding, and nothing is published to the DAO. If a step fails the application stays `pending`, so the admin can approve again; linking the same DAO twice is a no-op. A failure after step 3 (for example losing a race with another admin) leaves the DAO link and the admin roles already granted in place.

## What happened to the old setup flow

Approval used to run a multi-step setup (community, site and node, DAO publication) that could be `applying`, `failed` or stalled, with Resume and release actions in the admin UI. That is gone. Proposals migration `0004_drop_apply_lifecycle` moved any community application (`plugin_id = 'node'`) still `approved` with an `applying` or `failed` setup back to `pending` (with a `reopened` audit entry by `system`), so an admin can approve or reject it again. Proposals from other plugins are left as they are. Applications whose setup finished stay `approved`. Communities, sites and nodes that a failed old setup created are not removed.

API migration `0017_backfill-node-dao` copies the DAO of every community the old setup created (a live DAO-owned site) into its node metadata, so `getNodeDao` keeps reporting it without reading the site's account.
