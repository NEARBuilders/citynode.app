---
"ui": patch
---

Plain members now see only the organization overview. The Members, Teams, Invitations and API Keys tabs, and their data requests, are limited to owners and admins, and the Onboard tab to organizers, based on the viewer's role in that organization. Old `?tab=` links fall back to a tab the viewer can open, and the page fails closed with a retry if the role can't be loaded.
