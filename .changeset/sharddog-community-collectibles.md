---
"api": minor
"ui": minor
---

Community pages show the community's ShardDog collectibles: its membership badge and the badge of each public event with a drop linked, each with a "View in ShardDog" link. The section is hidden when nothing is linked or ShardDog is off. The new public `getNodeCollectibles` endpoint returns them, and the ShardDog client gains `dropUrl` and `describeDrop` (name and image; the stub returns none). Part of #602.
