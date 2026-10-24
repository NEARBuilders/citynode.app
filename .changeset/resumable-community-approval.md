---
"api": minor
"@everything-dev/proposals-plugin": minor
"ui": minor
---

Record community application setup steps (organization, community and node, DAO settings publication) on the proposal and show them to admins and applicants. Failed or stalled setups appear on the admin Pending tab and resume from the first unfinished step, reusing renamed organizations and communities and waiting on an open DAO vote instead of proposing the settings again. Rejecting a failed setup removes the organization and community it created when nothing else uses them, so the applicant can apply again with the same name.
