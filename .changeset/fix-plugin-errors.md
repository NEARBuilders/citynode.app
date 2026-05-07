---
"host": patch
"every-plugin": patch
---

Fix plugin error handling and shared dependency resolution in production.

### Host
- Use `formatError()` instead of `error.message` when logging plugin initialization failures. Effect's `Data.TaggedError` has an empty `message` by default, so errors were appearing as `[Plugins] Error:` with no detail.
- Mount a 503 stub router when the API plugin is unavailable, returning a proper JSON error body instead of an empty `{}` or 404.

### every-plugin
- Re-throw non-ORPC errors from the `onError` interceptor so they propagate to the caller instead of being swallowed, which caused oRPC to serialize `undefined` as `{}`.

### Config
- Move `better-auth` to `shared.ui` only in `bos.config.json`; remove from `shared.plugins`. The auth plugin bundles its own `better-auth` server-side — only the browser Module Federation boundary between host and UI needs it shared.
- Remove `drizzle-orm` from shared dependencies; it is an auth plugin implementation detail, not a runtime shared boundary.
