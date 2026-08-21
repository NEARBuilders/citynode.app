---
"everything-dev": patch
"ui": patch
"host": patch
"api": patch
"apps": patch
---

Fix Zephyr auth link being invisible during deploy, clean up build result classification.

- Set `FORCE_COLOR=1` in the env passed to deploy builds and in workspace `deploy` scripts. Zephyr's `isTTY` check gates the auth URL behind `isatty(stdout.fd) || FORCE_COLOR`, so piped/non-interactive builds never printed the URL — the build hung at "Waiting for browser authentication" with no visible link. `FORCE_COLOR=1` forces `isTTY` true, causing Zephyr to print the auth URL via `readline.question`.
- Show all stdout during deploy builds (not just chunks matching a Zephyr regex). The previous `onChunk` filter in `runBuildAttempt` gated stdout behind `/ZEPHYR|auth\.zephyr-cloud\.io\/authorize|ZE\d{4,}/` in non-verbose mode. Chunks can split across boundaries so the auth URL never matched. Deploy builds now pass all stdout through unconditionally.
- Extract `classifyBuildResult` as a pure function from `runBuildAttempt`, making the deploy-entry / ZE-error / exit-code / emoji-fallback / no-url classification testable without spawning processes.
- Pass `deploy` as an explicit boolean parameter to `runBuildAttempt` instead of checking `env.DEPLOY === "true"` as a side-channel.
- Fix variable shadowing where inner `const result: BuildAttemptResult` shadowed the outer `const result = await run(...)`.
- Consolidate the first build attempt into the retry loop (single `for` loop, iteration 0 is the first attempt) instead of calling `runBuildAttempt` once before the loop.
- Add a 1s base delay for non-Zephyr retries (previously retried immediately).
- Remove the unnecessary `wsEnv = { ...env }` copy.
