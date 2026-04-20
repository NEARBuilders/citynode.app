---
"everything-dev": minor
"host": minor
"api": patch
"ui": minor
---

## Infrastructure: CI optimization, Docker hardening, staging environments, config-driven architecture

### CI/CD improvements

- **Consolidated lint + typecheck** into a single job (was 2 sequential), removing ~1-2 minutes per CI run
- **Replaced `bun lint` + `bun format:check`** with single `biome ci .` command
- **Pinned Bun version** to `"1.4"` in all workflows (was `latest`)
- **Added native caching** via `setup-bun@v2` cache option (removed redundant `actions/cache`)
- **Upgraded `actions/checkout`** from v6 to v4
- **Parallelized typecheck** across packages using background processes (`& wait`)
- **Staging deployment workflow** (`.github/workflows/staging.yml`) — builds `:staging` image on merge to main
- **Preview deployment workflow** (`.github/workflows/preview.yml`) — builds `:pr-N` image per PR, comments preview URL
- **CI workflows read domain from `bos.config.json`** via `jq` instead of hardcoding

### Docker hardening

- **Non-root user**: Container now runs as `appuser` (UID 1001) instead of root
- **Layer caching**: Dependencies installed before source code copy for better cache hits
- **Bun 1.4**: Updated base image from `oven/bun:1.3.9-alpine` to `oven/bun:1.4-alpine`
- **Added `curl` and `/health` healthcheck** with 30s interval
- **Removed `Dockerfile.dev`**: Development flow uses `bos dev`, not a dev Docker image
- **Added `railway.json`** for Railway deployment configuration with health checks

### Staging environment support

- **Added `staging` field** to `BosConfigSchema` for staging domain configuration
- **Added `--env` flag** to CLI start command supporting `production` and `staging` environments
- **Updated `start` script** to accept `APP_ENV` environment variable for environment selection
- **Staging mode** sets `GATEWAY_DOMAIN` from `config.staging.domain` and labels process as "Staging Mode"

### Config-driven architecture

`bos.config.json` is now the single source of truth. All hardcoded values have been eliminated in favor of deriving from config at runtime or build time:

- **Removed hardcoded defaults** from `package.json` start script — `--account` and `--domain` no longer have shell fallbacks; config is read from `bos.config.json`
- **`BETTER_AUTH_URL`** now defaults to `config.hostUrl` instead of hardcoded `localhost:3000`
- **`fastkv.ts`** mainnet fallback uses the actual `accountId` parameter instead of hardcoded `"dev.everything.near"`
- **Host page title** uses `config.domain` instead of hardcoded `"everything.dev"`
- **UI app name** is injected at build time from `bos.config.json` via rsbuild `source.define` (was hardcoded `"everything.dev"` in 15+ route files)
- **UI `about.tsx`** registry query params use `activeRuntime.accountId`/`gatewayId` instead of hardcoded values

### Breaking changes

- `BOS_ACCOUNT` and `GATEWAY_DOMAIN` are no longer default-encoded in Docker image — config comes from `bos.config.json`
- Docker `CMD` no longer passes `--account` / `--domain` — use `APP_ENV` env var to switch environments
- `BosConfigSchema` now includes optional `staging` field — existing configs are unaffected
- `StartOptionsSchema` now includes optional `env` field — existing invocations are unaffected
- UI `branding.ts` `APP_NAME` now reads from `import.meta.env.APP_NAME` with `"everything.dev"` fallback