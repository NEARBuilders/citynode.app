---
"host": patch
---

Host now injects `trustedOrigins` from `CORS_ORIGIN` env var into the auth plugin's base variables, aligning Better Auth's CSRF/origin checks with the host's CORS policy. Explicit `auth.variables.trustedOrigins` in `bos.config.json` still takes precedence.
