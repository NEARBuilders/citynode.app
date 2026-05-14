---
"everything-dev": minor
---

- **Strip inheritable config fields**: `bos init` no longer duplicates `title`, `description`, `testnet`, `staging`, or `repository` from the parent config into the child project. These are inherited via `extends` — including them caused child projects to show stale parent metadata.
- **Fix stale catalog versions**: `personalizeConfig` now merges `resolveFrameworkCatalog()` over the copied `package.json` catalog, so all package versions (react, better-auth, @orpc/*, etc.) match the currently-running CLI instead of the parent template's versions.
- **Fix upgrade not applying new versions**: `bos upgrade` now deletes `bun.lock` before running `bun install` and runs install without `--ignore-scripts`. This forces Bun to re-resolve dependencies instead of reusing stale lockfile entries, fixing the bug where `everything-dev v1.15.0` persisted after upgrade.
- **Carry `.templatekeep` forward**: `readTemplatekeep` now always includes `.templatekeep` itself in returned patterns, and `.templatekeep` was added to the root template. Child projects can now run `bos sync` without "No .templatekeep found" errors.
- **Add convenience `bos` script**: Both `personalizeConfig` and `scaffoldMinimalProject` now add `"bos": "node_modules/.bin/bos"` to `package.json` scripts, so `bun run bos <command>` works for ad-hoc CLI calls like `bun run bos status`.
- **Delete stale lockfile during init**: The init flow now deletes `bun.lock` before `bun install`, ensuring a fresh resolution that matches the updated catalog.
