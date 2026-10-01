---
"every-plugin": minor
"everything-dev": minor
---

Atomic deploys phase A (tickets 01-02 of .scratch/atomic-deploys): builds emit content-hashed entrypoints (`remoteEntry.[contenthash].js`, `remoteEntry.server.[contenthash].js`), hashed `mf-manifest.json` and `style.css` copies, plus byte-identical legacy fixed-name aliases for the rollout window and a per-dist `build-report.json` for the deploy leg. Bundle cache classification now treats any content-hashed name as immutable regardless of base name. New `every-plugin/version-manifest` export defines the immutable per-deploy `WorkspaceVersionManifest` document, and config slots accept a `manifest` pointer (versioned manifest filename) — the deploy unit for atomic, additive deploys.
