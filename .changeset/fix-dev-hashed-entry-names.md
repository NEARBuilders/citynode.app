---
"every-plugin": patch
"everything-dev": patch
---

Fix dev/regression builds shipping hashed MF entry names: `isBuildInvocation` becomes `isDeployInvocation` gated on `DEPLOY=true` only (NODE_ENV is not a deploy signal — vitest runs as test, bundler CLIs default production), the rspack MF entry filename and the deploy train (`buildWorkspaceTargets({ deploy: true })` now sets `DEPLOY=true`) both derive from the artifact-names standard, and every `remoteEntry.js` literal in every-plugin and the host is imported from it instead of hardcoded. The regression container-build script inlines the retired `prepareLocalProductionConfig` rewrite so it stays self-contained under `bos sync`.
