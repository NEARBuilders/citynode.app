---
"everything-dev": minor
---

Add runtime account and domain overrides to `bos start`

- `bos start --account <id> --domain <domain>` now attempts to fetch the config from the FastKV registry first
- If the remote fetch fails, it gracefully falls back to the local `bos.config.json` instead of erroring
- The `--account` and `--domain` values are applied as overrides to whichever config is used (remote or local)
- The `start` npm script passes through `BOS_ACCOUNT` and `GATEWAY_DOMAIN` environment variables as CLI flags
- Added `packages/everything-dev/tests` to `.dockerignore`
