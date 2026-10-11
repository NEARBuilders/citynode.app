---
"ui": minor
"api": patch
"@everything-dev/auth-plugin": patch
---

Reorganizes the app around node-owner journeys. Home shows owners a "Get your node running" checklist (map pin, socials and description, first event, check-in QR) that ticks itself off, and newcomers and admins get "Start a community" and "Launch a new node" first. My community gains owner quick actions, a "Your role" badge and renamed QR check-in and Profile & settings tabs, and the sidebar drops Build and About from the main list and shows Members & roles only to managers. Members can no longer reach owner-only pages and now see their community's published events. The QR panel lists past check-ins with who joined, starting onboarding twice reuses the event's live code, and the check-in success screen opens the joined community. Owners can link a treasury DAO from the Team stake card, the Homepage and Community tabs are merged, map lookup outages get their own message, reused event links explain the rule, and the payout wait and email copy are corrected. Invitation emails that fail to send now report an error, and passkey users can accept invites sent to their real address.
