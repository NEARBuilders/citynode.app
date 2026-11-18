---
"ui": patch
"api": patch
---

Main-calendar Luma events that don't match a place (online events, for example) now show under Admin → Events → Needs a place, where a platform admin picks the place; the choice holds until the venue changes on Luma. Community calendars now update through Luma webhooks (`/api/webhooks/luma/{calendarId}`) instead of polling every five minutes, and their events show as soon as the calendar is connected: the Show/Hide buttons, the "imports waiting" notice and the sync error state are gone. Main-calendar events can be reported by the community of their place and appear in its Events tab with a "Main calendar" badge.
