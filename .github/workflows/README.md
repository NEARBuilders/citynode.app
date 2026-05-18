# GitHub Actions Workflows

## Overview

This repository uses the following production-facing workflows:

- `CI` — lint, audit, typecheck, Docker build, then release and publish
- `Release` — changeset versioning and npm publish for framework packages
- `Publish` — runtime deploy and FastKV config publish
- `Preview` — PR preview comments via Railway

The key design: `CI` calls `Release` and `Publish` as reusable workflows after lint+typecheck passes on `main`. `Release` owns changeset versioning and npm publishing. `Publish` owns runtime deploy (`bos publish --deploy`) and FastKV config publish.

## Workflows

### CI (`ci.yml`)

**Trigger:** Push to `main` (with `paths-ignore` for markdown and changesets) or pull requests. Also `workflow_dispatch`.

**Purpose:** Lint, typecheck, security audit, then call `Release` and `Publish` as reusable workflows. Also builds and pushes the Docker image.

**Jobs:**
1. `lint-and-typecheck` — install, build, postinstall, audit, lint, typecheck
2. `release` — calls `release.yml` (only on push to main)
3. `publish` — calls `publish.yml` (only on push to main)
4. `build-docker` — builds and pushes Docker image (only if `Dockerfile` exists)

**Key design decisions:**
- `secrets: inherit` is not used for the `publish` call because `publish.yml` declares `NEAR_PRIVATE_KEY` as `required: true`. The secret is passed explicitly to satisfy the reusable workflow contract.
- Docker build no longer requires `environment: production` approval, so it doesn't block release/publish.
- `Build every-plugin` runs before `postinstall` in both `release.yml` and `ci.yml` because `postinstall` triggers `types:gen` which needs `every-plugin` to be built first.

### Release (`release.yml`)

**Trigger:** `workflow_call` from `CI`, or `workflow_dispatch`.

**Purpose:** Consume changesets, create version PRs, and publish framework packages to npm.

**Lifecycle:**

```
1. Developer creates changeset          →  bun run changeset
2. Developer merges feature branch      →  Changesets land on main
3. CI triggers Release                   →  changesets/action detects changesets
                                           Creates/updates "chore: version packages" PR
4. Team merges Version Packages PR      →  CI triggers Release again
                                           No changesets remain (hasChangesets=false)
                                           ↓
                                           npm publish --provenance --access public
                                           ↓
                                           GitHub Releases created for each package
```

**npm publishing uses OIDC trusted publishing** — no `NPM_TOKEN` secret needed. `NODE_AUTH_TOKEN` is set to empty string, and `npm publish --provenance` authenticates via the OIDC token provisioned by `id-token: write` permission and `actions/setup-node` with `registry-url`.

### Publish (`publish.yml`)

**Trigger:** `workflow_call` from `CI`, or `workflow_dispatch`.

**Purpose:** Detect whether a commit requires runtime deploy or just config publish, then run `bos publish` (with optional `--deploy`).

**Behavior:**
- Scans `.changeset/` files for changes to deployable packages (ui, api, host, plugins)
- Checks if `bos.config.json` changed in the commit
- If deployable changes exist: runs `bos publish --deploy`
- If only config changed (or manual dispatch): runs `bos publish`
- Commits updated deployment URLs in `bos.config.json`

**Secret:** `NEAR_PRIVATE_KEY` is required (passed explicitly from CI) for FastKV publish.

### Preview (`preview.yml`)

**Trigger:** `pull_request` close events for cleanup, plus `workflow_run` after successful PR CI.

**Purpose:** Publish the Railway preview URL as a PR comment.

**Security:** Uses `workflow_run` only after successful internal PR CI, so repository secrets are not exposed to forked PRs.

**Configuration:** Set `RAILWAY_TOKEN` and `RAILWAY_PROJECT_ID` as GitHub Actions secrets. Optionally set `RAILWAY_SERVICE_NAME` as a repository variable.

## Docker Image Architecture

Docker images are built inline in `ci.yml`. The image uses a multi-stage build:

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
| `NEAR_PRIVATE_KEY` | Publish | NEAR key for FastKV config publish |
| `ZEPHYR_AUTH_TOKEN` | Publish | Zephyr Cloud auth for CDN deploy |
| `ZEPHYR_USER_EMAIL` | Publish | Zephyr Cloud user email |
| `BOS_INSTALL_NEAR_CLI` | Release, Publish | Ensures NEAR CLI is available |
| `GITHUB_TOKEN` | Release, Publish | Changesets PR creation, GitHub releases |