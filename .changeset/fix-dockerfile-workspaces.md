---
"host": patch
---

Fix Docker build for nested workspaces

Replace broken `COPY */package.json ./*/` with `COPY . .` before `bun install`, so nested workspace directories (`plugins/*/`, `packages/*/`) are present when Bun resolves workspaces. Fixes preview PR Docker builds failing with "Workspace not found".
