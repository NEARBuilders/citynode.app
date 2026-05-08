---
"host": patch
"everything-dev": patch
---

Extract auth plugin from monorepo and remove `BETTER_AUTH_URL` env dependency.

- **Deleted `plugins/auth/`**: The auth plugin is now maintained as an external package and loaded at runtime via Module Federation. The `app.auth` entry in `bos.config.json` remains intact for runtime loading.

- **`host/src/services/plugins.ts`**: Added `normalizeDomain(domain, env)` helper that:
  - Returns as-is if the domain already has `http://` or `https://`
  - Prepends `http://` for `localhost` / `127.0.0.1` in development
  - Prepends `https://` for everything else
  - Applied to `domain` and `hostUrl` base variables when loading the auth plugin.

- **Removed `BETTER_AUTH_URL`**: Dropped from `.env.example` and `packages/everything-dev/src/plugin.ts` env generation. The auth plugin now derives its base URL from the normalized `hostUrl` variable passed by the host at initialization time.
