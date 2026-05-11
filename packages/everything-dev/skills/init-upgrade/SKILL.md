---
name: init-upgrade
description: bos init, bos sync, and bos upgrade workflows — template download, snapshot-based conflict detection, package version bumps, and what .templatekeep/.templatesync-exclude control. Use when scaffolding new projects, syncing upstream changes, or upgrading framework packages.
metadata:
  sources: "src/cli/init.ts,src/cli/sync.ts,src/cli/upgrade.ts,src/cli/snapshot.ts"
---

# bos init, sync, upgrade

## bos init

Creates a new project from a published template:

```bash
bos init                              # Interactive
bos init -a my.near --domain my.dev   # Skip prompts
bos init --with-host                  # Include host in workspace
```

### Flow
1. Fetch parent config from FastKV (`bos://account/gateway`)
2. Download template tarball from parent's `repository` URL
3. Copy files matching `.templatekeep` patterns
4. Filter plugins: only included plugins + their routes are copied
5. `personalizeConfig()` — sets `extends`, `account`, `domain`, removes production URLs
6. `resolveWorkspaceRefs()` — normalizes package manifests, sets catalog refs
7. Write initial snapshot (`.bos/sync-snapshot.json`)
8. `bun install` + `bos types gen`

### .templatekeep

Lists glob patterns for files that should be copied from template:
- Scaffold runtime files (bos.config.json, package.json, biome.json, rsbuild configs)
- UI structure (routes/__root.tsx, components/index.ts, providers, hooks, lib)
- API structure (contract.ts, index.ts, db/, drizzle.config.ts)
- Plugin template (`plugins/_template/**`)
- GitHub workflows (`.github/templates/**` → `.github/`)

### .templatesync-exclude

Files copied on init but **never overwritten** on sync:
- `ui/src/components/**` — user-owned after init
- `ui/src/styles.css` — user-owned
- `ui/src/routes/_layout/**` — user-owned routes
- `api/src/contract.ts`, `api/src/index.ts`, `api/src/db/schema.ts` — user-owned business logic
- Generated files (`*.gen.ts`) — always regenerated

## bos sync

Pulls updates from the parent template:

```bash
bos sync                 # Sync from extends reference
bos sync --force         # Overwrite even locally modified files
bos sync --files         # Also sync template files
```

### Snapshot-based conflict detection

Uses `.bos/sync-snapshot.json` to track which files came from the template and their hashes:

| Local state | Template changed? | Action |
|------------|-------------------|--------|
| No local file | Yes | Add |
| Matches snapshot | Yes | Update (safe) |
| Modified since snapshot | Yes | Skip (unless `--force`) |
| Matches template | No | Skip |

Framework-owned files (from `FRAMEWORK_OWNED_SYNC_FILES`) are always updated when changed.

### What gets synced

From parent template → local:
- `app.*.production` — Zephyr URLs
- `shared` — dependency versions
- Framework-owned files (rsbuild configs, routers, etc.)

What stays local:
- `account`, `testnet` — your NEAR accounts
- `app.*.development` — local dev paths

### extends handling

Sync reads the `extends` field (string or object form) to find the parent. For object extends, uses the `production` URL to locate the template source.

## bos upgrade

Bumps `everything-dev` and `every-plugin` across all workspaces:

```bash
bos upgrade              # Check for new versions, update, then sync
bos upgrade --dry-run    # Preview without making changes
```

### Flow
1. Check npm registry for latest versions of `everything-dev` and `every-plugin`
2. Update root `package.json` workspaces.catalog
3. Update all workspace `package.json` to use `catalog:` references
4. `bun install` + `bos types gen`
5. Run `bos sync` to pull template updates matching new version
6. Rewrite legacy UI imports (e.g., `from "@/auth"` → `from "@/app"`)
7. Remove obsolete files

### Package ref strategy

Workspace packages use `catalog:` refs so a single version bump in root catalog propagates everywhere. Skips `workspace:*` and `file:` refs.

## bos publish

```bash
bos publish                  # Publish config to FastKV
bos publish --deploy         # Build, deploy to CDN, then publish
```

On `--deploy`:
1. Build all workspace targets
2. Deploy to Zephyr CDN → auto-updates `bos.config.json` with production URLs + integrity
3. Re-read config to pick up deploy updates
4. Publish full config to FastKV registry

**This is the only time `bos dev`-style writes touch `bos.config.json`** — it's the snapshot moment.

## Canonical Ordering

All writes to `bos.config.json` enforce `BOS_CONFIG_ORDER`:
`extends` → `account` → `domain` → `testnet` → `staging` → `repository` → `app` → `plugins` → `shared`

Unknown keys go after known keys.
