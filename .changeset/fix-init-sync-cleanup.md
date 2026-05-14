---
"everything-dev": minor
---

- **Strip inheritable config fields in init and sync**: `bos init` and `bos sync` now strip `title`, `description`, `testnet`, `staging`, and `repository` from the child `bos.config.json`. These are inherited via `extends` — including them caused child projects to show stale parent metadata.
- **Strip non-overridden app sections and production fields in sync**: Previously `app.host` and `app.auth` leaked into child configs during sync unless explicitly overridden. Now non-overridden sections are removed, and `production`/`integrity`/`ssr` fields are stripped from overridden entries in both init and sync modes.
- **Remove empty `plugins: {}`**: Empty plugins objects are now deleted instead of preserved, keeping the config clean.
- **Fix stale catalog versions**: `personalizeConfig` now merges `resolveFrameworkCatalog()` over the copied `package.json` catalog, so all versions match the currently-running CLI instead of the parent template's versions.
- **Fix upgrade not applying new versions**: `bos upgrade` uses plain `bun install` (without `--ignore-scripts` or `--force`) instead of `bun install --force`. This avoids bumping unrelated transitive dependencies while correctly resolving changed catalog entries.
- **Restore lockfile-aware init**: Init uses `stripOrphanedWorkspacesFromLockfile` instead of deleting `bun.lock`, preserving dependency resolutions and making installs fast (~seconds instead of minutes).
- **Carry `.templatekeep` forward**: `readTemplatekeep` always includes `.templatekeep` itself in returned patterns, and `.templatekeep` was added to the root template. Child projects can now run `bos sync` without "No .templatekeep found" errors.
- **Add convenience `bos` script**: Both `personalizeConfig` and `scaffoldMinimalProject` add `"bos": "node_modules/.bin/bos"` to `package.json` scripts for `bun run bos <command>`.