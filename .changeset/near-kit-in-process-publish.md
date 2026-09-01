---
"everything-dev": minor
---

`bos publish` signs FastKV registry transactions in-process via near-kit.

- Replaces the near-cli-rs shell-out: the publish transaction is built and signed with `near-kit` directly (no external binary, no curl|sh installer in CI, no key passed through argv).
- Key resolution: explicit key or `NEAR_PRIVATE_KEY` / `BOS_NEAR_PRIVATE_KEY` env, falling back to the near-cli-rs credentials file at `~/.near-credentials/<network>/<account>.json`; actionable error when neither is available.
- Real transaction hashes come from the RPC outcome instead of regex-parsing CLI output.
- Publishes are skipped when FastKV already holds an identical config (`isConfigAlreadyPublished`), saving allowance and the confirmation wait.
- `near-cli.ts` is slimmed to key management (`bos key generate`); CI workflows drop the NEAR CLI install steps.
