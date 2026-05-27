---
"everything-dev": minor
"host": minor
"ui": minor
---

Remove `cspNonce` from ClientRuntimeConfig, fix SSR asset URLs, dissolve style-chrome

- **everything-dev**: Remove `cspNonce` from `ClientRuntimeConfigSchema` (was leaking server-only value to client). Add `cspNonce` to `RouterContext`. Remove from `CreateRouterOptions`.
- **ui**: Fix SSR asset URL mismatch — server `assetPrefix` now uses `bosConfig.app.ui.production` CDN URL instead of `/`, so imported assets resolve to the same absolute URL on both SSR and client. Dissolve `style-chrome.tsx` into `_layout.tsx`. Remove all `useClientValue` calls for runtime config reads (now use `runtimeConfig` from route context directly). Move `cspNonce` from L1 prop into `RouterContext`. Remove `getCspNonce()` from auth client. Add `runtimeConfig` prop to `UnderConstruction`.
- **host**: Stop merging `cspNonce` into `runtimeConfig` for client shell.