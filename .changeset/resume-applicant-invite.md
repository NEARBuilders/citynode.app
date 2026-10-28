---
"api": patch
"ui": patch
---

Admins can resume setup for community applications that were submitted before the applicant's sign-in was saved with the application. Setup no longer stops with "no applicant identity". It makes the reviewing admin the organization owner and invites the applicant's NEAR account to join as an owner. Resuming again reuses the organization and community and sends no second invitation unless the first one expired. Setup also approves the new organization, which the auth plugin now creates as pending, so the community's organization is active and can take invitations. If such an application points at an organization that existed before it, that organization can't be checked against the applicant, so it is left untouched and setup creates the community's own organization instead. `applyCommunityProposal` now returns `applicantInvited`, and the admin's success message says when the applicant was invited.
