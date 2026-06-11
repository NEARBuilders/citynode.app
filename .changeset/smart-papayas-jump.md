---
"everything-dev": patch
---

Make AGENTS.md child-appropriate after `bos init`/`bos sync`/`bos upgrade`

Child projects now receive a personalized AGENTS.md that keeps the parent's
TanStack intent skill mappings but replaces parent-specific instructions with
content relevant to the child project (quick start, architecture, dev workflow,
plugin architecture, testing, troubleshooting).

AGENTS.md is handled as a special file in the sync flow — it is no longer in
`FRAMEWORK_OWNED_SYNC_FILES`. Instead, the sync generates the expected child
content from the parent's current skill mappings and compares against the local
child version, so it only updates when parent skills change.
