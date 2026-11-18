---
"ui": minor
"api": minor
---

Nodes are now only the link between a place and its community. A migration drops the legacy node `slug`, `name` and `parent_id` columns and their indexes, and refuses to run while a community node still has no place. A node's name and slug come from its place and its parent from the places tree, so `updateNode` no longer takes `name`, `slug` or `parentId`, `resolveNodeBySlug` no longer takes `parentId`, and the community rename controls on the site settings and admin node editor are gone. Community pages drop the old `?parentId=` from their links (old links still open). User-facing copy says "community" instead of "organization", `CONTEXT.md` gains the places glossary, and the community application docs are merged into `docs/official-applications.md`. The app no longer sets its own organization membership limit.
