---
"api": patch
"ui": patch
---

`/stake` lists every community again for signed-in members. `listStakeCommunities` now returns the full directory for everyone, with the viewer's active community first and their other communities after it, and marks each row with `viewerMembership` (`active`, `member` or null). The page only opens a community automatically when it belongs to the active organization, so members whose only organization is their personal one see the directory instead of an empty page.
