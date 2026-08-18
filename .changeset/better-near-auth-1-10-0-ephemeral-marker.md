---
"everything-dev": patch
---

Bump `better-near-auth` from 1.9.0 to 1.10.0 across the catalog and pin it exactly. The new release adds an optional `ephemeral?: true` marker on `RelayerEphemeralConfig`; mark the SIWN relayer block in `bos.config.json → app.auth.variables.siwn` with that explicit flag while keeping the existing `whitelistedContracts`, `maxGasPerTransaction`, and `maxDepositPerTransaction` constraints. Runtime behavior is unchanged — the marker is documentation only and `getRelayerInfo().mode` still reports `"ephemeral"`.
