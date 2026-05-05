---
"host": patch
---

Remove dead code: bootstrap script, drizzle/database infrastructure, and unused dependencies

The host no longer has a local database — auth is handled by a runtime-loaded plugin. Removed bootstrap.ts (superseded by orchestrator's spawnRemoteHost), drizzle.config.ts (schema directory already deleted), DrizzleORMMigrations rspack plugin, $apiClient global declaration, and 11 unused dependencies (drizzle-orm, drizzle-kit, better-auth, better-near-auth, @libsql/client, @proj-airi/unplugin-drizzle-orm-migrations, @t3-oss/env-core, @fastnear/near-connect, web-vitals, @tanstack/react-query, @tanstack/react-router). Cleaned up Dockerfile and .env.example accordingly.
