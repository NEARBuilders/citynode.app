# User Nav lives in the shell header, not the sidebar footer

Public pages already put User Nav in the top-right. The App Shell followed the shadcn sidebar example and put the account menu in `SidebarFooter`, so identity jumped between corners across public, signed-in, and admin routes.

We keep one `UserNav` in the header of both the Public Shell and the App Shell. Workspace switching stays in the App Shell sidebar (as on trezu.app). Authenticated and admin routes already share App Shell, so they pick this up together. A global header on `_layout` was tried before and produced double chrome; the shared piece is the component, not a third shell.

## Considered Options

- **Sidebar footer account row** (previous dashboard rebuild): identity stays visible in a collapsed sidebar, but public and app chrome disagree, and the menu disappears inside the mobile sheet.
- **User Nav in `_layout`**: one mount for every route, but it stacked a second header on the dashboard.
- **Header User Nav, sidebar keeps workspace switcher** (chosen): one account control, always top-right, less duplication.
