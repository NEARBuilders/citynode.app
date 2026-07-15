---
"everything-dev": minor
---

Improve `bos publish --deploy` output, parallelism, and failure detection:

- Add `--verbose` flag to `publish` and `deploy` commands for full build output
- Default (non-verbose) mode shows clean per-workspace summary with timing
- Parallelize non-host workspace builds (UI, API, plugins run concurrently)
- Detect Zephyr upload failures (ZE errors) and abort publish instead of silently publishing stale URLs
- Auto-retry once on transient Zephyr network errors
- Pre-flight NEAR signing and CLI checks before builds to fail fast
- Better NEAR transaction error messages with actionable hints
- Deploy result files (`.bos/deploy-results/`) eliminate `bos.config.json` write races during parallel builds
- `plugins/<id>/rspack.config.js` is now a framework-owned sync file (updated via `bos sync`)

Refactor `plugin.ts` (2,572 lines) into focused modules:

- `build.ts` (538 lines): workspace build orchestration — `buildWorkspaceTargets`, `buildOneWorkspace`, `runBuildAttempt` with Zephyr auth detection, `buildEverythingDevQuietly`, `buildEveryPluginQuietly`
- `publish.ts` (303 lines): NEAR/FastKV publishing — `publishToFastKv`, `waitForPublishedConfig`, `formatNearError`, `extractTransactionHash`
- `code-artifacts.ts` (40 lines): `generateCodeArtifacts` extracted to break circular dependency
- Extract `padRight` to `utils/string.ts`
- Consolidate `formatDuration` in `cli/timing.ts`, removing duplicate
- Unexport `buildCommands`, `WorkspaceTarget`, `resolveWorkspaceTarget` (internal-only)
