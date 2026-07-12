---
"everything-dev": minor
"host": minor
"ui": minor
---

Remove auto-generated plugin-sidebar system in favor of manual sidebar items in `_layout.tsx`

Deleted the entire `sidebar.ts` code generator, `SidebarItem`/`SidebarRole` types, all
`sidebar` fields from config/resolution schemas, the `plugin-sidebar.gen.ts` generated file,
and all sidebar migration/passthrough logic in the CLI, host runtime, and tenant runtime.
Sidebar items are now defined inline in `ui/src/routes/_layout.tsx`.
