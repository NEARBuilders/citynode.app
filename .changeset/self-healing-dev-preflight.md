---
"everything-dev": minor
---

Simplify the contributor getting-started flow to two commands: `bun install && bun run dev`. When the `bos dev` DB preflight finds local Postgres down (and every failure is an unreachable local service, `docker-compose.yml` exists, docker is reachable, and the stack is not test-mode), it now starts the compose services itself (`docker compose up -d --wait`) and re-probes once before failing. `.env` was already auto-created on first run — docs no longer tell you to copy it by hand, and `bos init`'s printed next steps drop the manual docker line.
