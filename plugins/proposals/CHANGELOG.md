# @everything-dev/proposals-plugin

## 1.2.0

### Minor Changes

- a577cd4: Accept community applications without a pre-existing organization, then provision or reconcile the community organization and its tenant/node when a platform admin approves. Preserve legacy organization requests and applicant identity checks. Admins can retry a failed application and see the recorded error.
- 70c7d8c: Consumer break-off: the app now extends the published base runtime (`bos://dev.everything.near/everything.dev`) on the latest RC train — everything-dev 2.0.0-rc.7, every-plugin 3.0.0-rc.4, better-near-auth 2.0.0-rc.0 — instead of vendoring the fork. Deploys are image-backed on the base's floating `everything-dev:rc` image (no local Docker build), and the citynode browser regression suite runs the retained app specs against a local `bos dev` stack on the adopted upstream harness (dev:ssr project; image-level validation is the deploy train's smoke gate).
- ef6e255: Record community application setup steps (organization, community and node, DAO settings publication) on the proposal and show them to admins and applicants. Failed or stalled setups appear on the admin Pending tab and resume from the first unfinished step, reusing renamed organizations and communities and waiting on an open DAO vote instead of proposing the settings again. Rejecting a failed setup removes the organization and community it created when nothing else uses them, so the applicant can apply again with the same name.

## 1.1.0

### Minor Changes

- 06966e9: Add reusable proposals and votes plugins, move API to orchestration, and shift builder/project review flows onto proposal-backed admin moderation.

### Patch Changes

- e94dd22: Fix project creation attribution and rework the project proposal flow (#7).

  - **api**: Add a `createProject` route so projects are always created directly, owned by the logged-in user's NEAR account. Non-admins cannot create public projects directly (public visibility is clamped to private) and must have a linked NEAR account. The proposal approve callback now updates the existing project's visibility instead of recreating it, so the approving admin is never recorded as the creator; proposals for projects that don't exist yet (e.g. API-key sources) are still created and attributed to the original proposer.
  - **projects plugin**: Non-admins can no longer flip a project to public via `updateProject`; making a project public requires admin approval through a proposal.
  - **ui**: Creating a project now creates it immediately (private first) and, when public visibility is requested, submits a proposal to make it public. The edit page routes public-visibility changes through the same proposal flow. Owner attribution no longer falls back to the opaque auth user id.
  - **proposals plugin**: Re-proposing an already approved/applied proposal resets it to pending instead of erroring, so a project that went public and was later made private can be submitted for review again. Prior decisions remain in the submissions history and audit log.
  - **api**: Project proposal owners must be valid NEAR account ids — opaque auth user ids and API key ids are rejected. Removing an applied project proposal now reverts the project to private instead of deleting it.

- 974cf46: Fix proposal attribution: store NEAR wallet address as `createdBy` instead of opaque user ID, and fix project ownership when proposals are approved by admins.

  - **proposals plugin**: Prefer `walletAddress` for `actorId` so `createdBy` stores the nominator's NEAR account (e.g. `alice.near`), making "Nominated by" display as a linkable identity on the builders page.
  - **api**: Use `proposal.createdBy` as fallback for `ownerId` in the projects create callback, so approved projects are attributed to the original proposer instead of the approving admin.
  - **ui**: Always include `defaultOwnerId` in project proposal payloads so non-admin proposals carry the proposer's identity even when the ownerId field is hidden from the form.

- c801c40: Complete the reviewed NEAR Catalog claim lifecycle and public presentation for issues #54 and #55.

  - Derive manual activity identity from authentication, add trusted admin-only activity emission, make emitted events idempotent, and support hiding revoked activity from feeds and leaderboards.
  - Apply approved Catalog claims through a compensating workflow that verifies current builder and Catalog state, records a verified activity snapshot, and safely retries or rolls back partial failures.
  - Support rejected and removed claim resubmissions while preserving proposal history, and expose complete claim review, retry, rejection, and revocation controls to administrators.
  - Present claimed Catalog contributions on builder profiles, render specialized claim activity, and merge current Catalog projects into the public and personal project directories without duplicating local projects.

- c801c40: Add the approved-builder NEAR Catalog contribution proposal flow.

  - Keep Catalog proposals private to their submitter and administrators across proposal lists, counts, audit logs, and event streams.
  - Add authenticated Catalog claim proposal submission and current-builder status APIs with server-derived claimant identity, active-project validation, normalized roles, idempotent retries, and rejected-only revisions.
  - Resolve linked NEAR identity from the auth context so notification reads and streams remain authenticated.
  - Accept array-shaped Catalog tags and isolate malformed search entries without converting valid empty results into upstream errors.
  - Add URL-backed manual activity and project contribution tabs with Project contribution as the approved-builder default, Catalog project search and preview, multi-role submission, proposal status cards, rejected-proposal editing, and an owner-only builder profile CTA.

## 1.0.0

- Initial release.
