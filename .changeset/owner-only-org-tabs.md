---
"ui": patch
---

Plain members now see only the organization overview. The Members, Teams, Invitations and API Keys tabs are limited to owners and admins, and the Teams, Invitations and API Keys requests only run for them. The Onboard tab stays with organizers. Tabs are based on the viewer's role in that organization. Old `?tab=` links fall back to a tab the viewer can open, and the page fails closed with a retry if the role can't be loaded.
