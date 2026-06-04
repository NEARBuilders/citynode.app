---
"host": patch
"ui": patch
---

Fix production CSP, viewer, and sign-out bugs

- **CSP nonce**: pass `cspNonce` to `ThemeProvider` so the `next-themes` inline bootstrap script satisfies `script-src 'nonce-...'`. Without this, the browser blocks the script, causing a React hydration mismatch (#418) and cascading failures.
- **Viewer regex**: fix invalid regex `/^/+/` in `_viewer` HTML template to `/^\/+/` so `widgetPath` leading slashes are correctly stripped instead of causing a SyntaxError.
- **Sign-out navigation**: add `router.invalidate()` before `navigate()` in both `UserNav` and `SecuritySettings` sign-out handlers. Without this, TanStack Router's `beforeLoad` auth guards read stale session state and redirect back to the login page instead of the home page.