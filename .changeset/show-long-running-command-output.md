---
"everything-dev": minor
---

Fix `bos init` hanging during "Installing dependencies...":

- **Populate full catalog**: Read `workspaces.catalog` from the running CLI's monorepo root and include all 42 entries, so workspace `catalog:` references resolve. Previously the minimal scaffold wrote an empty catalog, causing Bun to hang on resolve.
- **Seed lockfile**: Add `bun.lock` to `.templatekeep` so the template lockfile is copied during init, giving Bun a warm start instead of resolving everything from scratch.
- **Strip orphaned workspaces from lockfile**: New `stripOrphanedWorkspacesFromLockfile` removes workspace entries (e.g. `host`, `packages/*`, `plugins/*`) that don't exist in the scaffolded project, preventing resolution errors.
- **Call `personalizeConfig` in minimal scaffold path**: The minimal scaffold was skipping config personalization, leaving `postinstall` and `types:gen` scripts pointing at the monorepo paths instead of `node_modules/.bin/bos`.
- **Elapsed-time spinner**: `runBunInstall` and `runTypesGen` now update the spinner with elapsed seconds (e.g. "Installing dependencies... (8s)") while running.
- **Stream command output**: `bun install`, `bos types gen`, and `docker compose up` now stream their output via `stdio: "inherit"` instead of swallowing it.
- **Command timeouts**: `execCommand` now applies timeouts (5 min for bun/docker, 1 min for tar, 2 min default) so a hung process can't block the CLI forever.
- **`fetchRemotePluginManifest` timeout**: Added 10s `AbortController` timeout matching the existing `fetchJson` pattern.
- **Tests**: New `init.install-progress.test.ts` validates catalog population and lockfile workspace stripping.