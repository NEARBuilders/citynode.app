---
"ui": patch
---

`createApiClient` now accepts optional `headers` parameter for SSR cookie forwarding, allowing child projects to forward request cookies during server-side rendering. Also silences SSR-side console errors in the oRPC error interceptor and fixes the `sonner` shadcn import path in `__root.tsx`.
