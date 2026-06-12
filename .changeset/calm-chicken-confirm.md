---
"everything-dev": minor
---

Publish raw bos.config.json to FastKV instead of the fully-resolved config

Previously the publish flow resolved the entire extends chain and baked all
inherited fields (like `app.host`) into the published config. This prevented
parent host updates from flowing through to child configs at runtime, since
the server-side `resolvePublishedRuntime` would see the child's baked-in
value and skip the parent's current value.

Now the raw config (what the child explicitly defines) is published with its
extends field preserved, and the server resolves inherited fields dynamically
at read time.

Also adds `resolveRemoteConfigChain` which recursively resolves the extends
chain from KV, including nested entry extends for app entries (auth, api)
and plugins — so callers always receive a complete `BosConfig` with all
inherited fields and nested extends resolved.

Exports `resolveConfigComposableEntries` and refactors `getTargetedEntry` to
handle any `app.*` target path generically.
