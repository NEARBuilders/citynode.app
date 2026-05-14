---
"everything-dev": patch
"host": patch
"ui": patch
---

Clean up test infrastructure: proxy mock, dead env plumbing, and type cast

- **host/tests**: Replace 80-line manual `AuthClient` mock with an 8-line
  `Proxy`-based mock that auto-implements any property, making it resilient
  to auth client API changes.
- **host/tests**: Remove dead `vitest.setup.ts` and its `setupFiles` entry
  from `vitest.config.ts`. The `BOS_UI_URL`/`BOS_UI_SSR_URL` env var
  plumbing was unused after switching `loadTestRuntimeConfig` to read
  production URLs from `bos.config.json`. Simplify `global-setup.ts` to
  just build the UI dist (no HTTP server or env var setup needed).
- **ui**: Remove unnecessary type cast in `renderToStream` —
  `renderOptions.authClient` is now typed directly via `RenderOptions`.
  Remove unused `AuthClient` type import.