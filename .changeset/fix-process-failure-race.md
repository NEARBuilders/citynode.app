---
"everything-dev": patch
---n
Fix dev session process failure race condition and boot-up resilience

- Prevent double-completion of `readyDeferred` when a process fails by treating `"error"` as a terminal state in both the exit handler and the log-line handler.
- Make `awaitReady` resilient so a single failed process (e.g. a plugin with a TypeScript build error) no longer aborts the entire boot-up sequence; the host and other services continue starting.
