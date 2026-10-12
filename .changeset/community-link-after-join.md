---
"@everything-dev/auth-plugin": minor
---

Link new members to their community after joining. `redeemOnboardingCode` now returns the `organizationId` of the community joined, and the onboard success panel adds a "See <community>" link to that community's public page, below "Get build prompts". The link uses the same node My community opens first, and is left out when the community has no public page or any lookup fails.
