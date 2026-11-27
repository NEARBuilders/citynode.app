---
"api": patch
"ui": patch
---

Communities effectively no longer have a member cap. `bos.app.ts` raises the auth plugin's `organizationMembershipLimit` from the platform default of 100 to 100000, so joining by invite or onboarding code at a big event doesn't hit "This organization is full". It doesn't use the rc.46 off switch (`false`/`null`) because that hands `Infinity` to better-auth, which then sends `LIMIT Infinity` in its member queries and breaks loading an organization (everything-dev#914). Because better-auth also uses this value as the default row limit, member reads are now bounded: role checks use `getActiveMemberRole`, community cards read a member count, the members tab and the Official Application approval page through members 100 at a time, and minting a join code reads the platform admin's own role.
