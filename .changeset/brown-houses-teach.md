---
"everything-dev": minor
---

Use `plugins/*` workspace glob instead of individual `plugins/X` entries in `package.json`. This prevents `bun install` errors when upgrading projects that reference plugin workspaces that don't exist locally. Also removes `docker-compose.yml` from framework-owned sync files (it's now generated dynamically from runtime config). CI workflow templates no longer include the internal `packages/every-plugin` build step and Docker build steps are conditional on `Dockerfile` existing.