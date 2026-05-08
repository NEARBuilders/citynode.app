---
"everything-dev": patch
---

Fix plugins with `local:` development targets falling back to production URL when the local path is missing.

- **`src/config.ts` (`resolveRuntimeTarget`)**: When a `local:` path does not exist, return `source: "local"` instead of `source: defaultSource` (which was always `"remote"`). This preserves the semantic intent that the config value is a local reference, allowing `resolveDevelopmentTarget` to detect the missing path and fall back to the production URL.
- **`src/config.ts` (`buildRuntimePluginConfig`)**: Use `resolveDevelopmentTarget` for the development environment instead of calling `resolveRuntimeTarget` directly. This gives plugins the same production-fallback behavior already used by `app.*` entries (host, ui, api, auth) when a local development path is absent.
