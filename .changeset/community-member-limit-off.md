---
"api": patch
---

Communities effectively no longer have a member cap. `bos.app.ts` raises the auth plugin's `organizationMembershipLimit` from the platform default of 100 to 100000, so joining by invite or onboarding code at a big event doesn't hit "This organization is full". It doesn't use the rc.46 off switch (`false`/`null`) because that hands `Infinity` to better-auth, which then sends `LIMIT Infinity` in its member queries and breaks loading an organization.
