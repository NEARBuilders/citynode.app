---
"ui": patch
"api": patch
---

My community → Overview now says whether the community is on the map: not on Explore because the community is suspended, waiting for approval or being deleted; hidden from Explore until the profile is published; on Explore but without a map pin until a location is added; or nothing when it is on the map. People who can manage the community get a link to the settings page that fixes it; members see the status only. The Events tab uses the same notice, so a suspended or pending community no longer looks visible there, and "View on Explore" in the community header shows only when the community is listed. A new public `resolveTenantById` route returns a tenant's public fields, including its status, so the Events tab reads the status of the community's own tenant.
