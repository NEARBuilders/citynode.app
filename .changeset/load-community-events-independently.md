---
"ui": patch
---

The community Events page no longer waits on the profile to load: the events list loads on its own, and the profile is prefetched so the "Hidden from Explore" notice renders with it. Load failures on the Events page and in the settings Profile section now show the right state: a "can't edit this community" state with a way back to the overview when access is denied, a sign-in prompt when the session has expired, and a retry otherwise. Edit controls no longer flash while events load.
