---
"@everything-dev/auth-plugin": patch
"everything-dev": patch
---

Start-command regression stack fixes (the deployment-image path):

- The host's auth baseURL now prefers the `BASE_URL` env over the domain in production — the regression container serves on `http://localhost:4100`, and the domain-derived `https://` baseURL made better-auth set Secure cookies that no http client (Go jar or browser) would send back: sign-in succeeded but every session-bearing request 401'd.
- The auth plugin's better-auth core rate limiter can be disabled via `BETTER_AUTH_RATE_LIMIT_DISABLED=1` — production defaults it on with a single shared per-path bucket when no client IP is resolvable, which the regression suite's `/api/auth/*` traffic trips within seconds.
- The regression container now forwards the harness's `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX`, and `BODY_LIMIT_MAX` into the image — without them the host's middlewares ran defaults, so the oversized-body pin got a 404 (no procedure match for a 70KB text body) instead of 413, and the rate-limit burst never saw a 429.
