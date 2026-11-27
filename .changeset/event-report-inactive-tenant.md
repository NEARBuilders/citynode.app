---
"api": patch
---

Event reports are now read-only once a community's tenant is suspended or deleted, matching monthly reports: `getEventReport` returns `canEdit: false` and `saveEventReport` returns `FORBIDDEN`.
