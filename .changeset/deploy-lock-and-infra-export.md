---
"everything-dev": minor
---

Add a per-account/gateway FastKV-backed deploy lock, a `bos infra export` command that emits the resolved CI infra plan, and read plugin `extendsRef` from the resolved runtime config (instead of re-parsing raw `bos.config.json`).

- `bos publish --deploy` and `bos deploy` now acquire `apps/<account>/<gateway>/lock/deploy.json` before publishing. Stale or concurrent dispatches fail fast with `status: "locked"` and a conflict payload listing the owner, nonce, and txHash. Use `--no-deploy-lock` to opt out (deploy lock is on by default). The lock is released in a `finally` block after publish confirmation.
  - `bos publish` holds the lock for 10 minutes by default (the FastKV write window). `bos deploy` holds it for 25 minutes by default to cover publish + Railway redeploy. Override either with `BOS_DEPLOY_LOCK_TTL_MS` (positive integer, milliseconds).
- `bos deploy lock inspect` reports the active lock owner/nonce/expires/txHash; `bos deploy lock release` force-clears a stuck lock.
- `bos infra export [--target ci|local] [--network mainnet|testnet]` emits `{env, services, account, gateway, project, generatedAt}` JSON. The deploy workflow now consumes this to populate `$GITHUB_ENV` instead of repeating `API_DATABASE_URL`, `AUTH_DATABASE_URL`, and `CORS_ORIGIN` literals. Host port comes from `BOS_CI_HOST_PORT` env or `runtimeConfig.host.port`.
- `buildOriginMap` now derives plugin origins from `runtimeConfig.plugins[id].extendsRef` / `runtimeConfig.auth?.extendsRef` (already populated by `loadResolvedConfig`), removing the duplicate raw-JSON read and the parent-runtime fallback logic.
- Three new routes on the `bos` contract: `infraExport`, `deployLockInspect`, `deployLockRelease`. New tests cover the lock helpers, the CI plan builder, and the resolved-config origin lookup.
