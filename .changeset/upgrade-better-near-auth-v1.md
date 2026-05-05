---
"ui": patch
"@everything-dev/auth-plugin": patch
"everything-dev": patch
---

Upgrade better-near-auth from local file import to published v1.0.0

Switches the workspace catalog entry from `file:../../lib/better-near-auth` to `^1.0.0`, consuming the official npm release. The v1.0.0 package already includes the near-kit + @hot-labs/near-connect migration and the relay API shape used by the gateway page, so no source code changes are required.

- `relayer: {}` in server config continues to use all defaults (ephemeral auto-generated keypair)
- Client `siwnClient({ recipient, networkId })` remains valid
- `auth.near.buildSignedDelegateAction()` and `auth.near.relayTransaction({ payload })` APIs unchanged
