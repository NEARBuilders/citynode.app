# Luma event imports

CityNode supports manual events and Luma calendar imports side by side. Luma owns imported event details and registration; CityNode stores a public discovery projection with node associations, publication state, provider event/calendar IDs and a last-refreshed timestamp. It does not create or edit events in Luma.

## Connection

Following [nearbuilders.org's integration](https://github.com/NEARBuilders/nearbuilders.org/blob/main/plugins/events/src/services/luma.ts), configure `LUMA_CALENDAR_API_KEYS` as a comma-separated server secret. Each key is scoped to one calendar. Declare it in the API's secrets list and configure its value in the deployment's secret store; local development uses the same environment variable. Keys never enter browser responses or database activity records. An empty value leaves manual events fully usable.

Luma requires a Plus subscription for API access. See [Luma's API setup](https://docs.luma.com/reference/getting-started-with-your-api) and [calendar event listing](https://docs.luma.com/reference/get_v1-calendars-events-list). Connect only calendars approved for public discovery. All authorized node editors can select the platform's connected public calendars; a calendar key does not confer editing access to another CityNode node.

## Editor workflow

1. Open the node's discovery editor and select a connected Luma calendar.
2. Choose **Import / refresh calendar**. Public approved events are imported as drafts; private/member-only entries and guest-only location details are excluded.
3. Review events and publish them, optionally attaching other nodes you can edit. Manual events continue through **New event**.
4. Change imported titles, dates, timezone and venue in Luma. Refresh the calendar in CityNode to copy those changes. Publication and node associations are managed in CityNode.

Imports are explicitly refreshed by an editor, not scheduled. Before a campaign and during weekly content reviews, refresh calendars and check the visible last-refreshed date. Visitors follow the Luma link for current details and RSVP. No guest lists, meeting links or registration data are imported.

## Refresh rules

- Provider IDs retain the existing CityNode activity ID when event details or URLs change. Canonical URLs prevent duplicates with manual events and other calendars. Conflicting URLs are skipped and counted; shared events can be associated with additional nodes by an editor who has the required permissions.
- Refresh preserves publication choices, including drafts, moderation withdrawals and local cancellation notices. It never republishes a withdrawn event automatically.
- Events absent from a successfully fetched complete calendar, including events that became private, are withdrawn to drafts and cannot be republished until the source returns. Absence is not labeled as a cancellation.
- Provider failures, invalid public event data, incomplete pagination and rate limits fail before database mutation. The last imported snapshot remains available with its timestamp; the editor sees an error.
- Fetches have an eight-second timeout per request and a twenty-page cap (up to 1,000 events at the requested page size). Larger calendars fail explicitly instead of silently withdrawing unseen events. No arbitrary user-supplied URL is fetched.

This refresh model is suitable for an editorial pilot. Scheduled refresh or provider webhooks can be added when rollout requirements justify them; they are not implied by these imports.
