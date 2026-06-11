---
name: publish-sync
description: Publish bos.config.json to the FastKV registry, sync from upstream, and upgrade workspace packages. Use when deploying, syncing, or managing runtime configuration across projects.
metadata:
  sources: "packages/everything-dev/src/plugin.ts,packages/everything-dev/src/cli/sync.ts,packages/everything-dev/src/cli/upgrade.ts,packages/everything-dev/src/fastkv.ts,packages/everything-dev/src/integrity.ts,packages/everything-dev/src/config.ts"
---

# everything-dev Publish & Sync

## Core Workflow

```
Build → Deploy → Publish → Sync
  ↓       ↓        ↓        ↓
rspack  Zephyr   FastKV   bos sync
        CDN      registry
```

## Publish

Publish `bos.config.json` to the configured FastKV registry path for the app account/domain:

```bash
bos publish                  # Publish config only
bos publish --deploy         # Build/deploy all workspaces first, then publish
bos publish --dry-run        # Preview without sending
bos publish --network testnet
bos publish --packages ui,api
```

After `bos publish --deploy`:
1. Each workspace builds and deploys to Zephyr CDN
2. `bos.config.json` is auto-updated with production URLs + integrity hashes
3. Config is published to the FastKV registry at `{account}/bos/gateways/{gateway}/bos.config.json`

The `--network` flag controls the NEAR network (mainnet by default). With `--network testnet`, publishes go to the NEAR testnet chain under the testnet account specified in config.

### Rollback

To revert a publish, restore the previous `bos.config.json` from git and re-publish:

```bash
git checkout HEAD~1 -- bos.config.json
bos publish
```

Or cherry-pick a specific version of `bos.config.json` and publish that snapshot.

Lineage model:
- `extends` is the canonical parent edge between published runtimes
- `account` is the tenant namespace root for that runtime
- `domain` is the public ingress for that runtime
- a child runtime can extend a parent and still become a new tenant root on its own domain

## Sync

Pull template updates from the parent referenced by local `bos.config.json`:

```bash
bos sync
bos sync --force
bos sync --dry-run
```

What gets synced from the parent template:
- `app.*.production` — Zephyr URLs
- `app.*.ssr` — SSR URLs
- `shared` — shared dependency versions
- framework-owned files like build configs, router wiring, and shared runtime scaffolding

What stays local:
- `account`, `testnet` — your NEAR accounts
- `app.*.development` — local dev URLs

What gets merged:
- `app.*.secrets` — union of remote + local
- `app.*.variables` — merged (local overrides remote)

## Upgrade

Bump `every-plugin` and `everything-dev` across all workspaces:

```bash
bos upgrade              # Check for new versions, update, then sync
bos upgrade --dry-run    # Preview without making changes
```

`bos upgrade` updates **all workspace `package.json`s**, not just root. Also updates `peerDependencies` and `workspaces.catalog`. Correctly skips `workspace:*` and `catalog:` references.

## Build

```bash
bos build                # Build all packages (skips missing)
bos build ui             # Build specific package
bos build ui,api         # Build multiple
bos build --force        # Force rebuild
```

## Config Integrity

`bos.config.json` entries can include `integrity` fields with SRI hashes:

```json
{
  "app": {
    "ui": {
      "production": "https://cdn.example.com/ui/remoteEntry.js",
      "integrity": "sha384-abc123..."
    }
  }
}
```

These are auto-generated during `bos publish --deploy` and verified at runtime by the host.

## Configuration

All runtime config lives in `bos.config.json`. Key sections:
- `account` — NEAR mainnet account
- `testnet` — NEAR testnet account
- `staging.domain` — Staging domain
- `app.host`, `app.ui`, `app.api`, `app.auth` — Module configs with development/production URLs
- `plugins.{key}` — Plugin configs with variables, secrets, routes
- `app.api.shared`, `app.auth.shared`, `plugins.{key}.shared` — Module Federation shared dependency versions

### extends

Config can inherit from a parent via `extends`:
```json
{ "extends": "bos://dev.everything.near/everything.dev" }
```

Or per-environment:
```json
{
  "extends": {
    "development": "bos://dev.everything.near/everything.dev",
    "production": "bos://dev.everything.near/everything.dev",
    "staging": "bos://staging.everything.near/everything.dev"
  }
}
```

Deep merge: child overrides parent. Plugins are deep-merged (set to `null` to remove). `secrets` arrays are unioned. See the `extends-config` skill for full details.

Registry and discovery should treat `extends` as runtime lineage. That keeps remix ancestry, tenant roots, and published BOS refs aligned without adding a second parent field.

For remix-host browsing with the apps plugin:
- use `parent` when you want only direct children of a runtime
- use `ancestor` when you want all descendants of a runtime, even when that runtime is not the lineage root
- use `root` when you want the whole tree from the topmost ancestor
- prefer querying by canonical BOS ref like `bos://account/gateway`, not by host URL, because shared-host descendants can reuse the same host

### What bos dev writes vs bos publish writes

See `everything-dev#extends-config` for the full table. In short: `bos dev` and `bos build` write to `.bos/bos.resolved-config.json` (gitignored); `bos publish --deploy`, `bos plugin publish`, and `bos sync` write to `bos.config.json`.

## Troubleshooting

```bash
bos info              # Show current configuration
bos status            # Check remote health
```

### FastKV publish failures

- **NEAR RPC error**: Verify the configured NEAR account has sufficient gas and the FastKV contract is deployed at `{account}/bos/gateways/{gateway}/bos.config.json`
- **Account mismatch**: The `bos.config.json` `account` field must match the on-chain account that owns the FastKV path
- **Network mismatch**: Ensure `--network` matches where the account is deployed (mainnet vs testnet)
- **Dry-run first**: Use `bos publish --dry-run` to preview before sending

### Integrity verification

During `bos publish --deploy`, integrity SRI hashes are auto-generated for each remote entry and stored in `bos.config.json`. At runtime, the host:
- Verifies integrity on first load using bounded streaming (not full-response buffering)
- Uses stale-while-revalidate for asset requests to avoid latency spikes
- Blocks HTML and SSR requests on integrity mismatch
- Identifies SSR modules by both URL and `ssrIntegrity` hash in the cache

If a remote entry fails integrity check, the host rejects it and falls back to client-rendered output without that remote.

### Process issues

```bash
bos kill               # Kill all tracked processes
bun install            # Reinstall deps
bos dev                # Restart
```
