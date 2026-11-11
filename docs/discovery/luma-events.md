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
- A later Event Updated re-runs the match, so a venue change moves the event. Event Canceled, or an event turning private or members-only, removes it. Calendar Event Added looks the event up by id, since that delivery carries no location.
- An admin runs `backfillDiscoveryLumaPlaceEvents` once to bring in the events already on the calendar, past ones included. Running it again only refreshes them.
- When a community's own connected calendar lists the same event, the community's copy is shown and the main calendar's copy is skipped.

Still to come under #525: one admin triage list with "associate to place" for unmatched events, webhooks for per-place calendars, and removing the show/hide and polling state below.

## Editor workflow

1. Open the community's Events tab, choose **Import from Luma** and select a calendar. The selection is saved and public approved events are imported **hidden**. Under the calendar picker, a status line reports each non-zero outcome on its own line: events newly imported (with a reminder that they stay hidden), already imported events that were updated, events skipped because an event with the same URL is already on the community, and events hidden because they are no longer public on the selected calendar. When nothing was imported, updated or skipped and nothing was hidden, it says no new events were found.
2. Review imports. Overview and the Events tab show "N imported events waiting" with a link to the waiting imports. Choose **Show** on each event that belongs on the community calendar; **Hide** takes it back off Explore. Shown events reach visitors once the community profile is on Explore.
3. Manage event details and registration in Luma. CityNode checks for updates every five minutes while the API is running; visits also trigger a due check in the background without delaying the public map.
4. Use **Add event** for manual events. New events and posts default to Published. They remain independent of Luma.
5. Disconnect the calendar to withdraw its events from Explore. Manual events remain unchanged. Selecting another calendar replaces the connection.

Each node has one selected calendar. The same calendar can be selected by several nodes. Existing manual imports are not automatically connected: select the calendar once to enable ongoing updates.

## Synchronization rules

- A complete snapshot is saved atomically. Stable Luma event IDs preserve CityNode IDs across edits, removals and returns.
- Only public approved events are included; private/member-only events and guest-only addresses are excluded.
- Events stay hidden until an editor shows them, and each event keeps its shown or hidden choice across syncs. Imports saved before hidden-by-default (no stored choice) become hidden on their next sync.
- Removed or newly private events disappear on the next successful check and are labelled **Removed from Luma** in the editor. Returned public events reappear automatically if they had been shown, unless explicitly hidden in CityNode by an editor or moderator.
- Moderation withdrawals remain hidden after sync. Manual events are never overwritten or withdrawn. A manually added event with the same URL on the same node is retained instead of duplicating it.
- Calendar changes and disconnection serialize with synchronization so an old snapshot cannot restore disconnected events.
- Provider failures, invalid public data, incomplete pagination and rate limits preserve the last complete snapshot. The editor shows a connection error, the server logs the cause, and it retries after five minutes.
- Fetches have an eight-second timeout per request and a twenty-page cap (up to 1,000 events). Larger calendars fail explicitly rather than silently removing unseen events. Keys and guest data never enter browser responses.
- The worker runs with the API service and stops when that service shuts down. The persisted connection and sync timestamps survive restarts.
