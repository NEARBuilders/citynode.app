---
"@everything-dev/auth-plugin": minor
"ui": minor
---

Record whether each onboarding code redemption brought in a new member (`onboarding_redemption.new_member`, backfilled from membership timing for existing rows), add a platform-admin `listOnboardingJoins` procedure that counts, per organization and in total for a UTC calendar month, the distinct people who redeemed one of its codes and the distinct new members among them, and show both figures on the admin overview with a per-community this-month and last-month table (one row per organization, excluding sites pending deletion).
