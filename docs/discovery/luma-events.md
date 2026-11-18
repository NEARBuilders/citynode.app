# Luma event imports

CityNode supports manual events and Luma calendar imports side by side. Luma owns imported event details and registration; CityNode stores a public discovery projection with node associations, publication state, provider event/calendar IDs and a last-refreshed timestamp. It does not create or edit events in Luma.

## Connection

Following [nearbuilders.org's integration](https://github.com/NEARBuilders/nearbuilders.org/blob/main/plugins/events/src/services/luma.ts), configure `LUMA_CALENDAR_API_KEYS` as a comma-separated server secret. Each key is scoped to one calendar. Declare it in the API's secrets list and configure its value in the deployment's secret store; local development uses the same environment variable. Keys never enter browser responses or database activity records. An empty value leaves manual events fully usable.

Luma requires a Plus subscription for API access. See [Luma's API setup](https://docs.luma.com/reference/getting-started-with-your-api) and [calendar event listing](https://docs.luma.com/reference/get_v1-calendars-events-list). Connect only calendars approved for public discovery. All authorized node editors can select the platform's connected public calendars; a calendar key does not confer editing access to another CityNode node.

## Main calendar and places

The main shared Luma calendar is the primary source of events. Its events are attached to a place instead of a community, and every community shows the events of its own place and of every place below it. A country community sees the events of its states and cities; a city sees only its own.

Configure it with the `lumaMainCalendarId` API variable, the calendar's API key in `LUMA_CALENDAR_API_KEYS`, and the webhook signing secret (`whsec_…`) in `LUMA_WEBHOOK_SECRETS` (comma-separated, so a rotated secret can overlap the old one). In Luma, open the calendar's Settings → Developer → Webhooks and point a webhook at `https://<host>/api/webhooks/luma` for Event Created, Event Updated, Event Canceled and Calendar Event Added. Until both the calendar and a secret are set, the endpoint answers 404.

- Every delivery is checked against the `Webhook-Signature` header (HMAC-SHA256 over `timestamp.body`) and rejected when the signature is wrong or older than five minutes.
- An event's `coordinate` is matched against the place boundaries and the deepest containing place wins; a city named in the address that sits under that place refines it. Events without coordinates match on the address country, then region, then city. Online events and events that match nothing are stored without a place and never shown publicly.
- A delivery is treated as a signal: the receiver reads the event's current state with `GET /v1/events/get`, so retried or out-of-order deliveries never apply old data. This needs the main calendar's key in `LUMA_CALENDAR_API_KEYS`. A later Event Updated re-runs the match, so a venue change moves the event.
- Event Canceled marks the event cancelled and takes it off every feed, even when it arrives before the event was stored; a late retry of an earlier delivery can't bring it back. An event turning private or members-only, or no longer found on Luma, is deleted.
- An admin runs `backfillDiscoveryLumaPlaceEvents` once to bring in the events already on the calendar, past ones included (up to 10,000; events Luma returns malformed are skipped and counted). Running it again only refreshes them.
- When a community's own connected calendar lists the same event, the community's copy is shown and the main calendar's copy is skipped. Communities can still add an event by a link the main calendar already has.
- The main calendar is left out of the calendars a community can connect, even though its key sits in `LUMA_CALENDAR_API_KEYS`.

- Online events and events that match nothing land in one admin list: **Admin → Events → Needs a place**. Choosing a place there associates the event (`placeMatch: "manual"`). The choice holds across later updates until the venue on Luma changes, then the event is matched again.
- A main-calendar event is reported by the deepest community at or above its place. It shows in that community's Events tab with a "Main calendar" badge, and its report works like any other event report.

## Community calendars

A community can also connect its own Luma calendar. Its events belong to that community, sit at the community's place, and roll up the places tree like everything else.

1. Open the community's Events tab, choose **Import from Luma** and select a calendar. CityNode imports the calendar's public approved events once, and they show on the community calendar right away. The status line reports events imported, updated, skipped (an event with the same URL is already on the community) and removed.
2. A platform admin points a webhook in that calendar's Luma settings at `https://<host>/api/webhooks/luma/<calendarId>` (the editor shows this URL) for Event Created, Event Updated, Event Canceled and Calendar Event Added, and adds its signing secret to `LUMA_WEBHOOK_SECRETS`. Deliveries for a calendar no community has connected are ignored.
3. Edit event details and status on Luma. CityNode doesn't poll: each delivery reads the event's current state from Luma and updates every community connected to that calendar.
4. Use **Add event** for manual events. They remain independent of Luma.
5. Disconnect the calendar to remove its events. Manual events remain unchanged. Selecting another calendar replaces the connection.

## Rules

- Only public approved events are included; private/member-only events and guest-only addresses are excluded.
- An event that turns private or disappears from Luma is removed. If its community already filed a report for it, the event is kept as a draft (off every public page) so the report survives.
- Event Canceled marks the event cancelled. A moderator's "unpublish" sets it to draft, and later deliveries keep it that way.
- Luma owns imported details and status, so CityNode refuses edits to them; only co-hosting communities can still change.
- The one-time import on connect saves its snapshot atomically and fails without changing anything when Luma errors or the calendar is larger than 1,000 events. Fetches have an eight-second timeout per request. Keys and guest data never enter browser responses.
