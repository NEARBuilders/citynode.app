---
"api": patch
---

Node responses no longer include a community's join code id, and only members of the community and platform admins get its bulletin and bulletin attribution. Everyone else gets the node without `metadata.bulletin`, with `bulletinPublishedAt` and `bulletinPublisherName` set to null. Nodes that only belong to a community through their tenant use the tenant's organization for this check.
