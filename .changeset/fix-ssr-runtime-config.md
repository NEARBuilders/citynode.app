---
"ui": patch
---

Fix SSR runtime config errors by passing runtimeConfig to all auth clients

`getAuthClient()` and `sessionQueryOptions()` were being called without `runtimeConfig` during server-side rendering, which caused `getRuntimeConfig()` to throw "Runtime config is only available in the browser". This propagated as repeated SSR 500 errors across all routes.

Updated all route components and `UserNav` to read `runtimeConfig` from `Route.useRouteContext()` and pass it explicitly to `getAuthClient(runtimeConfig)` and `sessionQueryOptions(undefined, runtimeConfig)`. Also updated the `_layout.tsx` `beforeLoad` and `login.tsx` `beforeLoad`/`loader` to pass `context.runtimeConfig` into `sessionQueryOptions`.

Files changed: `_layout.tsx`, `login.tsx`, `$gatewayId.tsx`, `home.tsx`, `settings.tsx`, `organizations/$id.tsx`, `organizations/index.tsx`, `organizations/new.tsx`, `projects/index.tsx`, `projects/$id.tsx`, and `user-nav.tsx`.
