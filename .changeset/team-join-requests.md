---
"api": patch
"ui": patch
---

My community's Overview has a **Teams** section listing the community's teams that have at least one recognized Feature Area, with their areas. Members can **Ask to join** a team and withdraw a pending request. Current team members can endorse a request, and owners and admins approve or decline it. Approval adds the member to the team upstream in the approver's own session and is recorded only when that works. Requests whose requester left, whose team was deleted, or whose team lost its last Feature Area are closed with that reason. The API stores requests and endorsements in two new tables.
