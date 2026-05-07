---
"everything-dev": patch
"every-plugin": patch
---

Fix orchestrator crash cascade from MF DTS plugin failures.

- `everything-dev`: Add `Effect.catchAllDefect` boundary to `dev-session.ts` so an unhandled rejection in one process (e.g., Module Federation DTS `EISDIR`) no longer tears down the entire `Effect.scoped` scope and kills all child processes.
- `everything-dev`: Add process-level `unhandledRejection` and `uncaughtException` handlers in `orchestrator.ts` to prevent Node.js from aborting the orchestrator on internal plugin errors.
- `every-plugin`: Add `.catch()` to the plugin dev server async IIFE in `dev-server-middleware.ts` so fatal middleware setup errors are logged instead of becoming unhandled rejections that crash the child process.

This prevents the scenario where a TYPE-001 error in one plugin's MF DTS plugin would, within 1-2 minutes, cascade via `EISDIR` into killing the UI and all other plugins simultaneously.
