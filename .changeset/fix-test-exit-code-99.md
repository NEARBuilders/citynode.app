---
"api": patch
"every-plugin": patch
---

Fix integration test exit code 99 by ensuring tests run through vitest and resources are properly disposed.

- **CI workflow**: Changed `bun test` to `bun run test` so the CI job invokes vitest (with `--pool=forks`) instead of Bun's native test runner, which detects dangling event-loop handles and exits with code 99.
- **Root package.json**: Updated `test:api` and `test:integration` scripts to use `bun run test`.
- **every-plugin**: `PluginRuntime.shutdown()` now disposes the underlying Effect `ManagedRuntime` after plugin cleanup completes. A unit test that incorrectly reused the runtime mid-suite was fixed by moving shutdown into `afterAll`.
- **api**: The PGlite database driver now properly closes the underlying `$client` when `close()` is called, preventing WASM PostgreSQL instances from staying alive after tests finish.
