---
"everything-dev": patch
---

Fix deploy hanging in CI by preventing NEAR CLI from reading stdin and adding early validation for missing private key. Add logging around Railway redeploy and FastKV publish steps.

- **near-cli.ts**: Change `stdin: "inherit"` to `stdin: "pipe"` in `executeTransaction` when using `sign-with-plaintext-private-key`, preventing the NEAR process from hanging on stdin in CI environments. Fall back to `stdin: "inherit"` only for interactive keychain signing (when a TTY is available).
- **near-cli.ts**: Add early error when no private key is provided and no TTY is available, instead of silently falling through to `sign-with-keychain` which hangs indefinitely in CI.
- **near-cli.ts**: Change `installNearCli` from `stdio: "inherit"` to `{ stdin: "ignore", stdout: "inherit", stderr: "inherit" }` to prevent the installer script from reading stdin.
- **near-cli.ts**: Change `runNearCommand` from `stdio: "inherit"` to `{ stdin: "pipe", stdout: "inherit", stderr: "inherit" }`.
- **plugin.ts**: Add private key validation in `publishToFastKv` with clear error message when running in a non-TTY environment.
- **plugin.ts**: Add logging for Railway redeploy: service name, captured output, success/error status, and a message when `RAILWAY_TOKEN` is not set.
- **plugin.ts**: Add logging for FastKV publish: registry URL, transaction submission, and transaction hash on success.