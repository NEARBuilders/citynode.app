---
"everything-dev": patch
"ui": patch
"host": patch
---

Fix Zephyr deploy failures: retry exit-code-1 crashes and xpack SSR misdetection.

- The Zephyr error check in `runBuildAttempt` was positioned after the `exitCode !== 0` early return. When Zephyr's upload plugin threw inside `Compilation.hooks.processAssets`, rspack/rsbuild crashed with exit code 1, hitting the non-retryable failure path before the Zephyr error was ever detected. Move the Zephyr error detection (`ZE\d{4,}` regex) before the `exitCode !== 0` guard so Zephyr-caused crashes are classified as retriable (`exitCode: 0`) regardless of the actual process exit code.
- Replace the single retry with up to 3 retries (4 total attempts) using exponential backoff (2s, 5s, 10s) for Zephyr edge provider errors. This gives the upload endpoint time to recover under concurrent workspace build pressure — the previous single retry often failed because Zephyr was still overloaded from the parallel build batch.
- Set `snapshotType: "csr"` on the UI server and host `withZephyr` calls to prevent Zephyr's xpack coordinator from inferring `snapshotType: 'ssr'` (triggered by `target: "async-node"`) and either failing with "Could not infer the server entrypoint for a coordinated xpack build" (UI) or deploying `remoteEntry.js` as an SSR Worker entrypoint that 404s on fetch (host). Both are Module Federation Node.js remotes, not standalone SSR servers — `snapshotType: 'csr'` is Zephyr's documented override for this case.
