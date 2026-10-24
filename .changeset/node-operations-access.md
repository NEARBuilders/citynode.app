---
"api": patch
---

Node and validator edits now require an organization owner or admin, a platform admin, or a team granted node operations. Creating or moving a node checks the target parent, and a kind-only node update keeps the existing metadata. Organization API keys can no longer edit nodes or validators; use a member session of an owner, admin or a team granted node operations.
