---
"ui": minor
"api": minor
"@everything-dev/proposals-plugin": minor
---

The apply flow is now an Official Application. A DAO member picks the place their community is in (activating it first if it has no community yet) and asks to make it official. Approving it links the DAO to the community's organization and adds the reviewing admin as an org admin; nothing else is created, and a rejected or failed application leaves the community as it was. Admins no longer connect the DAO wallet to approve. Once approved, the community's own organization can attach validators, and `getNodeDao` reports the linked DAO. New route: `approveOfficialApplication`.
