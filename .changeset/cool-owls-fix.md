---
"everything-dev": patch
---

Fix `bos init` ordering: ensure env, install, types, and migrations run in correct sequence

- `ensureEnvFile` now runs before `bun install` so secrets are available for postinstall
- `bun install` uses `--ignore-scripts` to prevent postinstall from disrupting dependency installation (which caused incomplete `node_modules` and rsbuild/rspack "command not found")
- `bos types gen` runs explicitly after install via `node_modules/.bin/bos`
- `ensureEnvFile` now populates `CORS_ORIGIN` from the project domain (required by auth plugin)
- Added `CORS_ORIGIN` to `.env.example`
- Init "Next steps" now includes `docker compose up -d --wait`
- Same install/types-gen ordering applied to `bos sync` and `bos upgrade`
