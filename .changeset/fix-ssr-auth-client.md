---
"everything-dev": patch
"ui": patch
---

Fix SSR crash: pass runtimeConfig from router context to auth client instead of reading window.__RUNTIME_CONFIG__ during server-side route matching
