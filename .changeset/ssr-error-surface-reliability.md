---
"host": patch
"every-plugin": patch
---

Fixed SSR crash in `bos dev` with remote host and local UI without `--ssr` — the host no longer attempts SSR from the browser dev server (which doesn't serve `remoteEntry.server.js`). SSR is only attempted when an SSR URL is explicitly configured.

Fixed silent error suppression in the host API router interceptor — `formatORPCError` output is now properly `console.error`'d, matching the publicRpcRouters pattern.

Fixed `formatORPCError` box-drawing output to split messages on newlines and re-prefix each line with `│`, preventing misalignment when Drizzle's `Failed query` messages (which contain `\n`) are surfaced. The underlying PostgreSQL error is now visible in the error box.

Fixed framework-level scope lifecycle bug where `Layer.scoped` resources created in plugin `initialize` with `Effect.provide(...)` were tied to a transient scope and released immediately after initialization. Database pools and other long-lived scoped resources now persist correctly.

Added `PluginServicesTools` with a `buildService(tag, layer)` helper that builds scoped resources using `Layer.buildWithMemoMap` bound to the plugin lifecycle scope. Resources are automatically released on plugin shutdown.

Added `registerPlugin()` lifecycle tracking — initialized plugins are now registered with `PluginLifecycleService` so `shutdown()` and `cleanup()` correctly release plugin resources.

Fixed `evictPlugin()` cache key mismatch — eviction now uses the same key generation as `usePlugin`, so eviction correctly finds and shuts down cached plugins.

Added a per-plugin `MemoMap` for deduplicated layer construction when using `tools.buildService`.
