---
"everything-dev": patch
---

Generate docker-compose.yml with origin-based container names and fixed volume names. Containers/volumes are keyed by their `extends` source account (e.g. `auth.everything.near-postgres-auth`) instead of the local project name, so repos sharing the same extends source reuse the same containers and avoid port conflicts. Generated docker-compose.yml is now gitignored.
