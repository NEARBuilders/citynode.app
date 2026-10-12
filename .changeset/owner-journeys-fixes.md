---
"ui": patch
"api": patch
"@everything-dev/auth-plugin": patch
---

Accepting an organization invitation again requires the signed-in account's own email to match the invited address. A passkey account with a placeholder email can no longer take over an invite link and have the invited address written onto it, marked as verified, without proving it controls that address. Starting onboarding for an event again starts a new station with its own join limit, as before, instead of silently handing back the event's live code. Members of a team with the Events area keep their organizer access: they see Events and Onboarding in My community, keep the Organization link in the sidebar so they can start onboarding from Organization → Onboard, open the community's event pages, see drafts and hidden Luma imports, create and edit events, connect, switch and disconnect the Luma calendar, and approve imports, while the bulletin, social posts, community profile and settings stay with owners and admins. The organization's Homepage tab is back beside Community, so owners and admins can again propose a new homepage to the DAO with their own wallet and follow the vote, and the node page's "Propose homepage change" link opens it.
