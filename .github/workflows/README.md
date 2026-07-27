# GitHub Actions Workflows

## Overview

This repository uses the following production-facing workflows:

- `CI` — lint, audit, typecheck, framework tests, and regression
- `Docker` — Docker build and push, called by `Release` after npm publish or on `Dockerfile` changes
- `Release` — changeset versioning and npm publish for framework packages
- `Deploy` — app deploy (Zephyr CDN + FastKV config publish)

The key design: `CI` is the validation workflow. On successful push to `main`, CI sends a `repository_dispatch` event that triggers `Release`. After `Release` (and `Docker`) complete, `Release` sends a `repository_dispatch` that triggers `Deploy`. This chain ensures:

- No skipped workflow runs (PR CI runs never trigger downstream workflows)
- SHA is explicitly propagated end-to-end via `client_payload`
- Deploy always runs after Docker finishes (no stale Railway redeploy)
- Docker only builds when packages are actually published (not just versioned)

`Docker` is called by `Release` via `workflow_call` — it only builds when packages are actually published (`actually_published=true`), so merging the "chore: version packages" PR alone does not trigger an image build.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to `main` (with `paths-ignore` for markdown and changesets) or pull requests. Also `workflow_dispatch`.

**Purpose:** Lint, typecheck, security audit, framework tests, regression, and downstream notification.

**Jobs:**
1. `detect-changes` — diffs against base to determine if `packages/everything-dev/` or `packages/every-plugin/` changed
2. `lint-and-typecheck` — install, build, postinstall, audit, lint, typecheck
3. `framework-tests` — runs `everything-dev` tests (only if `everything-dev` or `every-plugin` changed)
4. `plugin-tests` — runs `every-plugin` tests (only if `every-plugin` changed)
5. `regression` — full stack regression with Playwright + Go HTTP tests (needs `lint-and-typecheck`)
6. `notify` — sends `repository_dispatch(ci-main-success)` with SHA (only on push to main, all jobs must pass)

**Key design decisions:**
- `Build every-plugin` runs before `postinstall` because `postinstall` triggers `types:gen` which needs `every-plugin` to be built first.
- `detect-changes` uses native `git diff` (no third-party action). For `workflow_dispatch`, all tests run unconditionally.
- `notify` requires `actions: write` permission to call the dispatch API. It has a 3-retry backoff.
- Playwright browsers are cached by `bun.lock` hash — cache hit only installs system deps (~10s), miss does full install (~60-90s).
- `cancel-in-progress: true` is safe for CI — cancelled runs never send `repository_dispatch` (the `notify` job is blocked).
- Skipped jobs in `needs` are non-blocking: `notify` runs if `framework-tests`/`plugin-tests` are skipped (no relevant changes), but won't run if any needed job failed.

### Docker (`docker.yml`)

**Trigger:** `workflow_call` from `Release` (only when `actually_published=true`), `push` to `main`/`staging` on `Dockerfile` changes, or `workflow_dispatch`.

**Purpose:** Build and push the Docker image only when a release actually publishes packages, or when the Dockerfile itself changes.

**Behavior:**
- Detects whether the repository has a `Dockerfile`
- Skips the build steps entirely when no Dockerfile exists
- Pushes `latest`, branch, and SHA tags to `ghcr.io`

### Release (`release.yml`)

**Trigger:** `repository_dispatch(ci-main-success)` from CI, or `workflow_dispatch`.

**Purpose:** Consume changesets, create version PRs, and publish framework packages to npm.

**Lifecycle:**

```
1. Developer creates changeset          →  bun run changeset
2. Developer merges feature branch      →  Changesets land on main
3. CI succeeds on main                   →  repository_dispatch triggers Release
                                             Creates/updates "chore: version packages" PR
4. Team merges Version Packages PR      →  CI triggers Release again
                                             No changesets remain (hasChangesets=false)
                                            ↓
                                            npm publish --provenance --access public
                                            (tracks actually_published output)
                                            ↓
                                            GitHub Releases created for each package
                                            ↓
                                            Docker build (only if actually_published=true)
                                            ↓
                                            repository_dispatch(release-completed) → Deploy
```

**npm publishing uses OIDC trusted publishing** — no `NPM_TOKEN` secret needed. `NODE_AUTH_TOKEN` is set to empty string, and `npm publish --provenance` authenticates via the OIDC token provisioned by `id-token: write` permission and `actions/setup-node` with `registry-url`.

**Docker gating:** The `docker` job only runs when `actually_published=true` (packages were actually published to npm, not just versioned). This prevents wasteful Docker builds after the "chore: version packages" merge when all versions were already published.

**Deploy notification:** The `notify-deploy` job runs after both `release` and `docker` complete. It sends `repository_dispatch(release-completed)` with the SHA, triggering Deploy. When Docker is skipped (no publishing), `notify-deploy` still fires — Deploy is needed for Zephyr CDN even without a new Docker image.

### Deploy (`deploy.yml`)

**Trigger:** `repository_dispatch(release-completed)` from Release, or `workflow_dispatch`.

**Purpose:** Build and deploy all workspaces to Zephyr CDN, publish `bos.config.json` to FastKV, and redeploy Railway.

**Behavior:**
- Runs `bos publish --deploy` (Zephyr CDN deploy + FastKV publish)
- Redeploys the Railway service (Docker image already built by Release)
- Commits and pushes updated `bos.config.json` deployment URLs back to `main`

**Secrets:** `NEAR_PRIVATE_KEY` and `ZEPHYR_CI_TOKEN` come from repository secrets. NEAR for FastKV publish, Zephyr CI token for CDN deploy. If `ZEPHYR_CI_TOKEN` is not set, falls back to `ZEPHYR_AUTH_TOKEN` + `ZEPHYR_USER_EMAIL` (legacy server-token auth).

**`cancel-in-progress: false`** — interrupting `bos publish --deploy` mid-flight could leave Zephyr CDN and FastKV in an inconsistent state. Queued deploys pick up the latest main when they run.

## Child Project Flow

Generated child repos use a simpler flow (no npm publish, no Docker):

```
CI → repository_dispatch(ci-main-success) → Release (version PR + GitHub releases)
                                         → Deploy (Zephyr CDN + FastKV)
```

Both Release and Deploy trigger from the same `ci-main-success` dispatch, running concurrently. No `release-completed` dispatch is needed.

## Docker Image Architecture

Docker images are built in `docker.yml`. The image uses a multi-stage build:

```
Builder stage:
  COPY . .                              # Full repo (including packages/)
  RUN bun run scripts/resolve-workspace-refs.ts   # normalize framework refs for install
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
- The normalize script rewrites `workspace:*` references to concrete package versions before install.
- The final image excludes `packages/` source code, producing a smaller image.
- The start command uses `bos` from `node_modules/.bin/bos` instead of `bun packages/everything-dev/cli.js`.

## npm Trusted Publishing (OIDC)

npm packages are published using **Trusted Publishing** (OpenID Connect), which eliminates the need for a long-lived `NPM_TOKEN` secret.

**How it works:**
1. The release job has `id-token: write` and `contents: write` permissions
2. `actions/setup-node` provisions Node 24 with npm 11 and configures the npm registry
3. Release staging writes normalized package manifests into `.release/`
4. `NODE_AUTH_TOKEN` is set to empty string — `npm publish --provenance` authenticates via OIDC
5. Provenance attestations link the published package to the exact commit and workflow

**Setup (already done):**
- Trusted publisher configured on npm for both `every-plugin` and `everything-dev`
- Publisher points to this repository and the `release.yml` workflow filename
- No `NPM_TOKEN` secret is needed or configured

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEAR_PRIVATE_KEY` | Deploy | NEAR key for FastKV config publish |
| `ZEPHYR_CI_TOKEN` | Deploy, Staging (as `ZE_CI_TOKEN`) | Zephyr Cloud CI token for CDN deploy (preferred) |
| `ZEPHYR_AUTH_TOKEN` | Deploy, Staging (as `ZE_SECRET_TOKEN`) | Zephyr auth used as direct bearer token; `ZE_CI_TOKEN` fallback |
| `ZEPHYR_USER_EMAIL` | Deploy, Staging (as `ZE_USER_EMAIL`) | Fallback Zephyr user email when `ZEPHYR_CI_TOKEN` is absent |
| `GITHUB_TOKEN` | Release, Deploy, CI notify | Changesets PR creation, GitHub releases, repository_dispatch |

NEAR CLI is installed in a dedicated workflow step before publishing so Actions can apply the PATH update before `bos publish --deploy` runs.
