---
"host": "patch"
"everything-dev": "patch"
"ui": "patch"
---

Upgrade hono to >=4.12.18 to resolve 5 security vulnerabilities (CSS injection, JWT validation, cache leakage, XSS, bodyLimit bypass). Soften CI audit step to warn instead of fail on high/critical findings for build-time-only dependencies.