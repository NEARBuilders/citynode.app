---
"everything-dev": minor
---

Add `bos types gen` command for remote-first type generation and consolidate generated type files.

- New CLI command `bos types gen` for unified type generation from configured API and plugin contracts.
  - Respects `NODE_ENV` (default development, `production` forces remote URLs).
  - `--dry-run` flag previews what would be fetched without writing files.
  - Fetches oRPC contract types and `additionalExports` (e.g. `auth-export.d.ts`) from deployed plugin manifests.
- `packages/everything-dev/src/api-contract.ts`:
  - Extended `ApiPluginManifest` with `additionalExports` support.
  - Added `fetchAuthAdditionalExports` to pull `auth-export.d.ts` from remote auth plugins.
  - Auth contract types now included in `api/src/plugins-client.gen.ts` (single file), removing the separate `api/src/auth-client.gen.ts` file.
- `ui/src/lib/auth-client.ts`:
  - Now imports `createAuthInstance` from `../auth-types.gen` instead of the local `plugins/auth/src/auth-export` path.
- `packages/everything-dev/src/cli/init.ts` (`personalizeConfig`):
  - Sets `postinstall` to `"bos types gen"` instead of deleting it.
  - Creates `ui/src/auth-types.gen.ts` stub alongside other `.gen.ts` stubs.
  - Removed `api/src/auth-client.gen.ts` stub creation (consolidated into `plugins-client.gen.ts`).
- Gitignore updated: `**/*.gen.ts` and `.bos/generated/` instead of per-directory rules.
- Added integration test `init.typecheck.test.ts` that scaffolds a project, installs, and verifies typecheck produces zero unexpected errors.
