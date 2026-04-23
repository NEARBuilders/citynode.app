# GitHub Actions Workflows

## Overview

This repository uses four workflows: release, staging, preview, and CI. The release pipeline is the most critical — it orchestrates npm publishing, CDN deployment, and Docker image building in a single sequential job where each step gates the next.

## Workflows

### Release (`release.yml`)

**Trigger:** Push to `main` that changes `.changeset/**`, `package.json`, or the workflow file itself. Also `workflow_dispatch`.

**Purpose:** Version packages, publish to npm, deploy to Zephyr CDN, publish config to FastKV, and build/push the Docker image.

**Lifecycle:**

```
1. Developer creates changeset          →  bun run changeset
2. Developer merges feature branch      →  Changesets land on main
3. Release workflow triggers            →  changesets/action detects changesets
                                          Creates "chore: version packages" PR
                                          (bun run version bumps versions)
4. Team merges Version Packages PR      →  Release workflow triggers again
                                          No changesets remain (hasChangesets=false)
                                          ↓
                                          Build every-plugin + everything-dev
                                          ↓
                                          npm publish (gates everything below)
                                          ↓
                                          GitHub Releases for all packages
                                          ↓
                                          bos publish --deploy (Zephyr + FastKV)
                                          ↓
                                          Commit bos.config.json [skip ci]
                                          ↓
                                          Docker build + push (multi-stage, inline)
```

**Key design decisions:**

- **npm publish gates everything.** If npm publish fails, no Zephyr deploy or Docker build happens. The `everything-dev` and `every-plugin` packages must be on npm before the Docker image can be built (the image installs them from npm, not from workspace refs).
- **Single sequential job.** All steps run in one job so that failure at any point stops the pipeline. There is no separate `publish-npm` job or `docker.yml` dispatch.
- **Multi-stage Docker build.** The builder stage copies the full repo (including `packages/`), resolves `workspace:*` refs to npm versions via `scripts/resolve-workspace-refs.ts`, then runs `bun install`. The final stage copies only app code + `node_modules` — no `packages/` directory. This produces a smaller image with a clean separation between framework packages (from npm) and app code.
- **`bos start` reads config from `bos.config.json`.** The Docker start command uses `bos start --env production --no-interactive` instead of passing `--account`/`--domain` flags. Account and domain are read from the config file at runtime.

### Staging (`staging.yml`)

**Trigger:** `workflow_run` after CI completes on `main`. Also `workflow_dispatch`.

**Purpose:** Build and push a `:staging` Docker image for the staging environment.

**Behavior:** Reads the staging domain from `bos.config.json` (falls back to the production domain), builds the same multi-stage Docker image, and pushes with the `:staging` tag. Railway auto-deploys from this tag.

### Preview (`preview.yml`)

**Trigger:** `pull_request` events (opened, synchronize, reopened, closed).

**Purpose:** Comment config context on PRs. Railway's built-in PR environments handle the actual build and deploy.

**Behavior:** On PR open/update, reads `account` and `domain` from `bos.config.json` and comments them on the PR. Railway automatically creates an environment, builds from the PR branch using the Dockerfile, and assigns a `*.up.railway.app` URL. On PR close, comments that the preview is cleaned up.

**Note:** Preview deployments currently serve production UI/API from CDN URLs (the host loads remotes from `bos.config.json` production fields). Host and Docker changes are tested against the PR branch. Full PR code testing for UI/API/plugins requires a future "preview" environment mode with Zephyr deploy per-PR.

### CI (`ci.yml`)

**Trigger:** Push to `main` or pull requests.

**Purpose:** Lint, typecheck, and test. Also builds and pushes a `:latest` Docker image on main push.

### Docker Build (`docker.yml`)

**Trigger:** `workflow_dispatch` only (manual).

**Purpose:** Manually build and push a Docker image. Not called by the release workflow (which builds inline). Exists as a safety valve for manual rebuilds.

## Docker Image Architecture

The Docker image uses a multi-stage build:

```
Builder stage:
  COPY . .                              # Full repo (including packages/)
  RUN bun run scripts/resolve-workspace-refs.ts   # workspace:* → npm versions
  RUN bun install                       # Installs from npm + remaining workspaces

Final stage:
  COPY --from=builder node_modules      # Pre-installed deps (from npm)
  COPY --from=builder bos.config.json   # Runtime config
  COPY --from=builder package.json      # Start script
  COPY --from=builder host/ api/ ui/ plugins/  # App code only
  # packages/ is NOT copied — excluded from final image
```

**Why this design:**

- `packages/everything-dev` and `packages/every-plugin` are framework packages published to npm. The Docker image installs them from the registry, not from local source.
- The resolve script (`scripts/resolve-workspace-refs.ts`) replaces `workspace:*` references with the just-published npm versions in all `package.json` files, and removes `packages/*` from the workspace list. This happens in the builder stage only — the committed `package.json` on `main` keeps `workspace:*` for local development.
- The final image is smaller because `packages/` source code (including tests, build configs, etc.) is excluded.
- The start command uses `bos` (the CLI binary from `node_modules/.bin/bos`) instead of `bun packages/everything-dev/cli.js`.

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ZE_SECRET_TOKEN` | Release | Zephyr Cloud auth for CDN deploy |
| `ZE_SERVER_TOKEN` | Release | Zephyr Cloud server auth |
| `ZE_USER_EMAIL` | Release | Zephyr Cloud user email |
| `NPM_TOKEN` | Release | npm registry auth for publishing |
| `NEAR_PRIVATE_KEY` | Release | NEAR key for FastKV publish |
| `BOS_INSTALL_NEAR_CLI` | Release | Ensures NEAR CLI is available |
| `APP_ENV` | Docker runtime | `production` or `staging` |
| `PORT` | Docker runtime | HTTP port (default 3000) |
| `BETTER_AUTH_SECRET` | Railway | Auth encryption key |
| `BETTER_AUTH_URL` | Railway | Auth callback URL |
| `HOST_DATABASE_URL` | Railway | Host database connection |
| `HOST_DATABASE_AUTH_TOKEN` | Railway | Host database auth |
| `CORS_ORIGIN` | Railway | Allowed CORS origins |
