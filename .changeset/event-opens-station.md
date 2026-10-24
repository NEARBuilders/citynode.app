---
"ui": minor
---

An event's onboarding button opens its station. On My community → Overview, each upcoming event's "Onboarding" button and the Events tab's "Start onboarding" menu item now open that event's newest live station, or start one with the default join limit when none is live. Both are shown only to organizers: community owners and admins, and members of a team with the `events` area. The Onboarding tab's own "Start onboarding" still starts a new station each time, so organizers can run more than one per event. `listOnboardingCodes` takes an optional `eventId` to list one event's codes, so a live station is found however many codes the organization has.
