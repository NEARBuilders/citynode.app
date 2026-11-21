---
"api": patch
---

Communities no longer have a member cap. `bos.app.ts` sets the auth plugin's `organizationMembershipLimit` to `false` (everything-dev #900, rc.46), so joining by invite or onboarding code at a big event never hits "This organization is full".
