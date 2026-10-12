---
"ui": patch
"api": patch
"@everything-dev/auth-plugin": patch
---

Accepting an organization invitation again requires the signed-in account's own email to match the invited address. A passkey account with a placeholder email can no longer take over an invite link and have the invited address written onto it, marked as verified, without proving it controls that address. Starting onboarding for an event again starts a new station with its own join limit, as before, instead of silently handing back the event's live code.
