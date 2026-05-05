---
"host": minor
"@everything-dev/auth-plugin": minor
---

Upgrade better-auth to 1.6.9, mature auth plugin, and add auth orchestration

Auth plugin now uses Drizzle migrations with virtual:drizzle-migrations, Effect acquireRelease for DB lifecycle, and requires BETTER_AUTH_SECRET. Fixes API key and invitation method shapes for better-auth 1.6.9. The everything-dev CLI orchestrates auth as a first-class dev process. Host replaces Deferred with FiberHandle and resets federation state on shutdown.
