---
"everything-dev": patch
---

Stop inheriting parent plugins through `extends`, remove the fake plugin registry path, make `bos upgrade` offer new parent plugins as an explicit opt-in, and fix `bos init` to generate `.env.example`, `.env`, and `docker-compose.yml` from resolved secrets.
