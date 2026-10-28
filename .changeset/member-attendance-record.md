---
"ui": minor
"api": minor
---

Members see the events they checked in at. My community Overview has a "Your events" section for that community, and Home lists events across all communities, including ones the member has left. When an organizer opens Overview, City Node reads each community event's onboarding codes and check-ins from auth and keeps them, so history survives expired and deleted codes. Gaps are labelled as incomplete: events not synced yet, events whose code listing may be truncated at 20, and failed reads. Check-ins from codes that aren't tied to a community event are listed separately and don't count as attendance. New `getMyAttendance` and `reconcileAttendance` procedures and three tables (migration 0006).
