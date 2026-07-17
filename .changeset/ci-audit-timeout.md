---
"everything-dev": patch
---

Fix `bun audit` hang in CI template and parent workflows. Bun 1.2.20 has a known cycle-detection bug (oven-sh/bun#20800) causing `bun audit` to hang indefinitely. Wrapped the audit step with `timeout 120` and `timeout-minutes: 5` so it fails fast instead of blocking CI. Also added `timeout-minutes: 20` to the `Publish with deploy` step in deploy/staging workflows as a backstop against Zephyr interactive auth hangs when all tokens are missing.
