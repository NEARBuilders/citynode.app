---
"ui": patch
"api": patch
---

Bulletins on Home and My community now say which community posted them, who posted them and when. The server records the publisher and date from the signed-in session whenever a bulletin is set, changed or cleared through `setNodeBulletin`, `createNode` or `spawnNode`; saving the same text again keeps the original attribution. `updateNode` never credits its caller: it keeps the attribution while the bulletin text is unchanged and drops it when the text changes or is removed. Node responses carry `bulletinPublishedAt` and `bulletinPublisherName`, and the publisher name is only returned to signed-in readers and never an email address. Bulletins saved before this change show the community name without attribution. Migration 0011 adds three nullable columns to `nodes`.
