---
"ui": patch
---

The community Events page no longer waits on the profile to load: the events list loads on its own, and the events and profile are prefetched together so the "Hidden from Explore" notice renders with the list. Load failures on the Events page and in the settings Profile section now show the right state: a "can't edit this community" state with a way back to the overview when access is denied, a sign-in prompt when the session has expired, a "community not found" state with a way home when it no longer exists, and a retry otherwise. A failed background refresh keeps already-loaded events and profile on screen. Edit controls no longer flash while events load.
