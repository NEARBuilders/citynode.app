---
"everything-dev": patch
---

Fix deploy result capture by switching from env-var-based (`BOS_DEPLOY_RESULT_DIR`) to stdout-based parsing (`[BOS_DEPLOY]` lines):

- Add `reportDeployResult` and `parseDeployLines` to integrity.ts — build configs print structured deploy info to stdout, orchestrator parses it instead of reading deploy result files
- Remove `writeDeployResult`, `readDeployResults`, `readAllDeployResults`, `cleanDeployResultDir` (and `BOS_DEPLOY_RESULT_DIR` env var)
- Remove `label` field from `DeployResultEntry` (unused)
- Refactor all 5 build configs (`host`, `ui`, `api`, `apps`, `template`) to use `reportDeployResult`, deleting ~150 lines of duplicated `updateBosConfig`/`updateHostConfig` logic
- Fix `run.ts` — when `capture: true` + `onChunk` are both used, accumulate chunks in-memory to avoid empty stdout/stderr (stream flowing mode conflict with execa)
- Fix `extractPublishedUrl` to match Zephyr deploy pattern first for more reliable extraction
- Strip `deployEntries` field from `deployResults` array (internal-only, not part of `WorkspaceDeployResult` schema)
