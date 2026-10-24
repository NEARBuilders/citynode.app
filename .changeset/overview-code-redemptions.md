---
"ui": minor
---

Show a community's organizers (owners, admins, and members of a team with the events area) how many people redeemed one of its onboarding codes and how many of them were new members, for this and last UTC calendar month, on My community → Overview. Adds an organizer-scoped `getOnboardingRedemptions` auth procedure that shares its month window and distinct counting with `listOnboardingJoins`; platform admins who aren't members of the organization are rejected.
