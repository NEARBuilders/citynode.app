# Official Application approval

An Official Application asks to make an already-activated place community official by linking a Sputnik DAO to it. The proposals plugin only records the request and the review decision: `pending`, then `approved` or `rejected` (a rejected application can be revised by the same applicant). It has no setup or apply state.

`approveOfficialApplication` is the only approval path for community applications. A platform admin calls it with the proposal ID, entity ID and the `updatedAt` they reviewed. The API:

1. Loads the proposal and refuses it unless it is still `pending` and unchanged since the admin loaded it.
2. Resolves the place's community. A place with no community yet is refused (`PRECONDITION_FAILED`); activate it first.
3. Makes the reviewing admin an admin of the community's organization, then links the DAO to that organization through the auth plugin (`linkDao`). A community already linked to another DAO is refused (`CONFLICT`).
4. Copies the DAO account and network into the node's metadata, so signed-out visitors can read it through `getNodeDao` (anonymous callers cannot read org metadata).
5. Approves the proposal.

Nothing else is created: no organization, tenant, node or domain binding, and nothing is published to the DAO. If a step fails the application stays `pending`, so the admin can approve again; linking the same DAO twice is a no-op. A failure after step 3 (for example the approval losing a race with another admin) leaves the DAO link and the reviewer's admin role on the organization in place.

## What happened to the old setup states

Before this flow, approval ran a multi-step setup (organization, tenant and node, DAO publication) that could be `applying`, `failed` or stalled, with Resume and resource-release actions in the admin UI. That machinery is gone. Migration `0004_drop_apply_lifecycle` in the proposals plugin moves any community application (`plugin_id = 'node'`) still `approved` with an `applying` or `failed` setup back to `pending` (with a `reopened` audit entry by `system`), so an admin can approve it through the flow above or reject it. Proposals from other plugins are left as they are. Applications whose setup finished stay `approved`, including any whose approval revocation was in progress or had failed. The apply, removal and setup-step columns are dropped. Organizations, tenants and nodes that a failed old setup had already created are not removed; the release action that cleaned them up is gone.

API migration `0016_backfill-node-dao` copies the DAO of every community created by the old setup (a live DAO-owned tenant) into its node metadata, so `getNodeDao` keeps reporting it without reading the tenant's account.
