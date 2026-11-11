---
"api": minor
"ui": patch
---

Events on the main shared Luma calendar now find their place on their own. A signed webhook at `/api/webhooks/luma` handles events being created, updated, canceled or added to the calendar, and an admin backfill (`backfillDiscoveryLumaPlaceEvents`) brings in the events already there. Each event's coordinates are matched against the place boundaries and the deepest match wins; events without coordinates fall back to their city, region and country. The event shows on that place's community and on every community above it, so a country sees its cities' events and a city doesn't see another city's. Moving the venue moves the event, canceling or making it private removes it, and online or unmatched events are kept off public pages. Configure `lumaMainCalendarId` and the `LUMA_WEBHOOK_SECRETS` secret to turn it on.
