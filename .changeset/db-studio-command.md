---
"everything-dev": minor
---

Add `bos db:studio [plugin]` command for local and remote plugin databases. Opens Drizzle Studio for any plugin with a `_DATABASE_URL` secret. For local plugins (like `api` with `development: "local:api"`), runs drizzle-kit from the workspace. For remote plugins (like `auth` via `extends: "bos://..."`), introspects schema from the live database via `drizzle-kit pull`, then opens Studio. Default plugin is `api` for backward compatibility.
