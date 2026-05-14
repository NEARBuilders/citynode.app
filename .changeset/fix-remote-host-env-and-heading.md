---
"everything-dev": patch
---

Fix `bos dev --host remote` so the CLI loads the project `.env` file before it initializes the in-process remote host and plugin runtime, which restores host-side secret injection for auth and other plugins without requiring users to manually export env vars. This also removes the duplicate `Remote Host` status line before the TUI takes over so the startup output only shows the boxed `REMOTE HOST` heading.
