# everything-dev / bos Commands

Complete reference for `everything-dev` and its `bos` alias.

## Development

### `bos dev`

Start development server with configurable remote/local modes.

```bash
everything-dev dev           # Full local development
bos dev --host remote        # Remote host, local UI + API (typical)
bos dev --ui remote          # Remote UI, local host + API
bos dev --api remote         # Remote API, local host + UI
bos dev --ssr                # Full local development with SSR
bos dev --proxy              # Proxy API requests to production
bos dev -p 3001              # Custom port
bos dev --no-interactive     # Streaming logs (no TUI)
```

### `bos start`

Run with production modules (all remotes from production URLs).

```bash
bos start                           # Default port 3000, production mode
bos start -p 8080                   # Custom port
bos start --no-interactive          # Streaming logs
bos start --env staging --no-interactive  # Staging environment (uses staging domain from bos.config.json)
bos start --account foo.near --domain gateway.foo.com  # Load config from the FastKV registry
```

**`--env` flag:**
- `production` (default) - Uses production URLs from `bos.config.json`
- `staging` - Uses `staging.domain` from `bos.config.json`, sets `GATEWAY_DOMAIN` env var

### `bos serve`

Run CLI as HTTP server (exposes /api).

```bash
bos serve                    # Default port 4000
bos serve -p 5000            # Custom port
```

## Build & Deploy

### `bos build`

Build packages locally.

```bash
bos build                    # Build all packages
bos build ui                 # Build UI only
bos build api                # Build API only
bos build host               # Build host only
bos build ui,api             # Build multiple
bos build --force            # Force rebuild (ignore cache)
```

### `bos deploy`

`bos deploy` is not a standalone command in the current CLI. Use `bos publish --deploy` to build/deploy all workspaces and then publish the updated config.

### `bos publish`

Publish `bos.config.json` to the temporary `dev.everything.near` FastKV registry.

```bash
bos publish                  # Publish only
bos publish --deploy         # Build/deploy all workspaces, then publish
bos publish --network testnet
bos publish --dry-run        # Preview without sending
bos publish --packages ui,api
```

### `bos clean`

Clean build artifacts.

```bash
bos clean                    # Remove dist/ and node_modules/
```

## Project Management

### `bos create`

Scaffold new projects and remotes.

```bash
bos create project my-app              # New project
bos create project my-app -t org/repo  # Custom template
bos create ui                          # Add UI remote
bos create api                         # Add API remote
bos create host                        # Add host
bos create gateway                     # Add gateway
```

### `bos sync`

Sync dependencies and config from upstream. Replaces local `bos.config.json` with remote config while preserving `account`, `testnet`, and `development` URLs. Merges secrets arrays.

```bash
bos sync                                    # From every.near/everything.dev
bos sync --account foo.near --gateway foo.com
bos sync --network testnet                  # Sync from testnet
bos sync --force                            # Force update
bos sync --files                            # Also sync template files (rsbuild.config.ts, etc.)
```

### `bos upgrade`

Check for new versions of `every-plugin` and `everything-dev`, update them in **all workspace `package.json`s** (not just root), and then sync. Also updates `peerDependencies` and `workspaces.catalog` while correctly skipping `workspace:*` and `catalog:` references.

```bash
bos upgrade              # Check for new versions, update, then sync
bos upgrade --dry-run    # Preview without making changes
```

### `bos info`

Show current configuration.

```bash
bos info
```

### `bos status`

Check remote health.

```bash
bos status                   # Development endpoints
bos status -e production     # Production endpoints
```

## Gateway

### `bos gateway dev`

Run gateway locally (wrangler dev).

```bash
bos gateway dev
```

### `bos gateway deploy`

Deploy gateway to Cloudflare.

```bash
bos gateway deploy
bos gateway deploy -e staging
bos gateway deploy -e production
```

### `bos gateway sync`

Sync wrangler.toml vars from bos.config.json.

```bash
bos gateway sync
```

## Secrets (NOVA)

### `bos login`

Login to NOVA for encrypted secrets management.

```bash
bos login
```

### `bos logout`

Remove NOVA credentials.

```bash
bos logout
```

### `bos secrets sync`

Sync secrets from .env file to NOVA.

```bash
bos secrets sync --env .env.local
```

### `bos secrets set`

Set a single secret.

```bash
bos secrets set API_KEY=value
```

### `bos secrets list`

List secret keys (not values).

```bash
bos secrets list
```

### `bos secrets delete`

Delete a secret.

```bash
bos secrets delete API_KEY
```

## Registration

### `bos register`

Register a new tenant on the gateway.

```bash
bos register my-tenant              # Creates my-tenant.your-account.near
bos register my-tenant --network testnet
```

## Dependencies

### `bos deps update`

Interactive update of shared dependencies. Automatically syncs to catalog after updating.

```bash
bos deps update              # Update shared.ui deps
bos deps update api          # Update shared.api deps
```

## Process Management

### `bos ps`

List all tracked BOS processes.

```bash
bos ps                       # Show PID, name, port, started time
```

### `bos kill`

Kill all tracked processes with graceful shutdown (SIGTERM → SIGKILL).

```bash
bos kill                     # Graceful shutdown
bos kill --force             # Force kill immediately (SIGKILL)
```

Process tracking uses `.bos/pids.json` to track spawned processes.

## Docker

Use the repo `Dockerfile` directly, or build the image in CI and push to GHCR.

```bash
docker build -t everything-dev .
docker run -p 3000:3000 everything-dev
```

The container uses `bun run start` and reads configuration from `bos.config.json`. 

Set `APP_ENV=staging` to use the staging domain from config. Required secrets: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `HOST_DATABASE_URL`, `HOST_DATABASE_AUTH_TOKEN`, `CORS_ORIGIN`.

### `bos docker stop`

Stop running containers.

```bash
bos docker stop <containerId>   # Stop specific container
bos docker stop --all           # Stop all BOS containers
```
