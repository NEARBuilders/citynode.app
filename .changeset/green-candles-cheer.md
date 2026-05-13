---
"everything-dev": patch
---

Stop inheriting parent plugins through `extends`, remove the fake plugin registry path, make `bos upgrade` offer new parent plugins as an explicit opt-in, and fix `bos init` to generate `.env.example`, `.env`, and `docker-compose.yml` from resolved secrets. Also speed up `bos init` by removing duplicate codegen, add timeouts to remote contract fetches, and print per-phase timing summaries for `bos init` and `bos upgrade`.
