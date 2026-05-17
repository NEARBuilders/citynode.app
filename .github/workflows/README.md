# GitHub Actions Workflows

## Overview

This repository uses the following production-facing workflows:

- `CI` — lint, audit, and typecheck
- `Packages Release` — changeset/version gate for framework packages
- `Release` — production Zephyr deploy + FastKV publish
- `Publish Config` — standalone config-only publish path when `bos.config.json` changes
- `Staging Deploy` — staging Docker image
- `Preview` — PR preview comments and preview deploy helpers

The important distinction is that `release.yml` is the reusable production deploy workflow, while `packages-release.yml` is the gate that decides when production deploy should happen.

## Workflows

### Packages Release (`packages-release.yml`)

**Trigger:** Push to `main`. Also `workflow_dispatch`.

**Purpose:** Test the framework packages, create or update the `chore: version packages` PR when changesets are pending, and call the reusable production deploy workflow once those changesets have been consumed.

**Lifecycle:**

```
1. Developer creates changeset          →  bun run changeset
2. Developer merges feature branch      →  Changesets land on main
3. Packages Release triggers            →  changesets/action detects changesets
                                          Creates/updates "chore: version packages" PR
4. Team merges Version Packages PR      →  Packages Release triggers again
                                          No changesets remain (hasChangesets=false)
                                          ↓
                                          npm publish / GitHub release steps run for framework packages
                                          ↓
                                          Deploy job calls release.yml
```

### Release (`release.yml`)

**Trigger:** `workflow_call` from `packages-release.yml`, or `workflow_dispatch`.

**Purpose:** Build and deploy runtime surfaces to Zephyr, publish `bos.config.json` to FastKV, commit the refreshed production URLs, and build/push the Docker image.

**Lifecycle:**

```
1. Packages Release decides deploy      →  calls release.yml with deploy=true
2. Release installs dependencies        →  bun install --frozen-lockfile --ignore-scripts
3. Release regenerates artifacts        →  bun run postinstall
4. Runtime surfaces deploy              →  bun run deploy
5. Config is published to FastKV        →  bos publish
6. Deployment URLs are committed        →  bos.config.json [skip ci]
7. Docker image is built and pushed     →  inline latest image build
```

**Key design decisions:**

- **`Packages Release` is the changeset gate.** If there are pending changesets, deploy is intentionally skipped until the version PR is merged.
- **`Release` owns production deploy.** Zephyr deploy and FastKV publish happen in `release.yml`, not `ci.yml`.
- **Docker is part of the parent release workflow only.** Child-project templates no longer use this exact workflow shape.
- **Normalized manifests for shipping.** Source manifests keep `workspace:*` and `workspaces.catalog` for monorepo development. Release staging, generated apps, and Docker builds normalize framework refs to concrete semver while preserving `workspaces.catalog` where appropriate.
- **Multi-stage Docker build.** The builder stage copies the full repo (including `packages/`), normalizes framework workspace refs via `scripts/resolve-workspace-refs.ts`, then runs `bun install`. The final stage copies only app code + `node_modules` — no `packages/` directory. This produces a smaller image with a clean separation between framework packages (from npm) and app code.
- **`bos start` reads config from `bos.config.json`.** The Docker start command uses `bos start --env production --no-interactive` instead of passing `--account`/`--domain` flags. Account and domain are read from the config file at runtime.

### Publish Config (`publish.yml`)

**Trigger:** `workflow_run` after `CI` completes on `main`. Also `workflow_dispatch`.

**Purpose:** Publish `bos.config.json` to FastKV when a commit changes the config directly, without requiring the full production release flow.

**Behavior:** On automatic runs it checks whether the triggering commit changed `bos.config.json`. If so, it runs `bos publish`. On manual dispatch it can also run `publish --deploy`.

### Staging (`staging.yml`)

**Trigger:** `workflow_run` after CI completes on `main`. Also `workflow_dispatch`.

**Purpose:** Build and push a `:staging` Docker image for the staging environment.

**Behavior:** Reads the staging domain from `bos.config.json` (falls back to the production domain), builds the same multi-stage Docker image, and pushes with the `:staging` tag. Railway auto-deploys from this tag.

### Preview (`preview.yml`)

**Trigger:** `pull_request` close events for cleanup, plus `workflow_run` after successful PR `CI` to publish the resolved Railway preview URL.

**Purpose:** Let Railway own PR environments while GitHub Actions mirrors the real Railway preview URL back onto the PR.

**Security note:** Uses `workflow_run` only after successful internal PR `CI`, so repository secrets are not exposed to forked PRs.

**Behavior:** After `CI` succeeds for an internal PR, the workflow polls Railway's GraphQL API for the matching ephemeral PR environment, resolves the public Railway domain for the preview service, and upserts a single PR comment with the real URL. When the PR closes, that bot comment is removed.

**Configuration:** Set `RAILWAY_TOKEN` and `RAILWAY_PROJECT_ID` as GitHub Actions secrets. If the project exposes more than one public Railway domain, set `RAILWAY_SERVICE_NAME` as a repository variable to pick the correct service.

### CI (`ci.yml`)

**Trigger:** Push to `main` or pull requests.

**Purpose:** Lint, typecheck, security audit, and a separate Docker image build on main push.

**Security features:**
- `dependency-review-action` runs on every PR to flag known vulnerabilities
- `bun audit` fails on critical/high findings
- All actions pinned to commit SHAs
- `--ignore-scripts` on all installs

### Docker Images

Docker images are built inline in the parent repo's `ci.yml`, `staging.yml`, and `release.yml` workflows. Generated child repos no longer scaffold Docker as part of their blocking CI or release workflows.

## Docker Image Architecture

The Docker image uses a multi-stage build:

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
- The normalize script (`scripts/resolve-workspace-refs.ts`) rewrites framework `workspace:*` references to concrete package versions and updates matching `workspaces.catalog` entries before install. This happens in the builder stage only — committed manifests keep monorepo-friendly refs for local development.
- The final image is smaller because `packages/` source code (including tests, build configs, etc.) is excluded.
- The start command uses `bos` (the CLI binary from `node_modules/.bin/bos`) instead of `bun packages/everything-dev/cli.js`.

## npm Trusted Publishing (OIDC)

npm packages are published using **Trusted Publishing** (OpenID Connect), which eliminates the need for long-lived `NPM_TOKEN` secrets. Instead, GitHub Actions generates short-lived OIDC tokens that npm verifies against the configured trusted publisher.

**How it works:**
1. The release workflow provisions OIDC tokens only during the npm publish steps (not at job level — `id-token: write` is removed from job-level permissions as a security hardening measure)
2. `actions/setup-node@v6` provisions Node 24 with npm 11 support and configures the npm registry
3. Release staging writes normalized package manifests into `.release/` before publish
4. `npm publish --provenance` authenticates via OIDC using `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`
5. Provenance attestations are automatically generated, linking the published package to the exact commit and workflow

**Setup (already done):**
- Trusted publisher configured on npm for both `every-plugin` and `everything-dev` at `https://www.npmjs.com/package/<name>/access`
- Publisher points to the repository, `release.yml` workflow filename
- `NPM_TOKEN` secret is used for `NODE_AUTH_TOKEN` during publish (scoped to publish steps only, not job-level env)

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `ZE_SECRET_TOKEN` | Release (build step) | Zephyr Cloud auth for CDN deploy |
| `ZE_SERVER_TOKEN` | Release (build step) | Zephyr Cloud server auth |
| `ZE_USER_EMAIL` | Release (build step) | Zephyr Cloud user email |
| `NEAR_PRIVATE_KEY` | Release (publish step), Publish | NEAR key for FastKV publish |
| `BOS_INSTALL_NEAR_CLI` | Release | Ensures NEAR CLI is available |
| `APP_ENV` | Docker runtime | `production` or `staging` |
| `PORT` | Docker runtime | HTTP port (default 3000) |
| `BETTER_AUTH_SECRET` | Railway | Auth encryption key |
| `BETTER_AUTH_URL` | Railway | Auth callback URL |
| `HOST_DATABASE_URL` | Railway | Host database connection |
| `HOST_DATABASE_AUTH_TOKEN` | Railway | Host database auth |
| `CORS_ORIGIN` | Railway | Allowed CORS origins |
