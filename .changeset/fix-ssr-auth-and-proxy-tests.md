---
"everything-dev": minor
"host": minor
"ui": patch
---

Fix SSR auth client injection, proxy test mock shape, and test config resolution

- **host**: Pass `authClient` to SSR `renderToStream` so the host's pre-resolved auth client
  is reused instead of creating a new one from config. Export `toAuthClientContext` for use
  in program.ts. Proxy test mock updated to use correct `initialized.context` shape instead
  of putting handler directly on `initialized`.

- **everything-dev**: Add optional `authClient` field to `RenderOptionsWithApi` type so
  callers can provide a pre-configured auth client for SSR rendering.

- **ui**: `renderToStream` now uses `authClient` from render options when provided, falling
  back to `createAuthClient(runtimeConfig)` when not specified.

- **host/tests**: Replace `process.env`-based `BOS_UI_URL`/`BOS_UI_SSR_URL` with production
  URL fallbacks from `bos.config.json` (`app.ui.production`, `app.ui.ssr`). Add
  `createMockAuthClient` helper returning a null-session auth client for SSR tests. Pass
  `session: null` and `authClient` in test render options to match production SSR semantics.