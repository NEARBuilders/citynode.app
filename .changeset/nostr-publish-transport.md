---
"everything-dev": minor
---

`bos publish` now uses a nostr-signed transport for FastKV registry writes.

- `bos publish` signs a NIP-78 app-data event (kind 30078, `d` tag = the registry key, content = the exact config JSON) with a local nostr deployment key and posts it to the apps plugin's `nostrRelayKvWrite` route, replacing the direct NEAR transaction.
- Set `NOSTR_PRIVATE_KEY` (nsec or hex) in the environment or CI; generate and bind a deployment key at `/settings/deployment-keys`.
- Config payloads larger than 48KB are rejected before signing; publishes are skipped when FastKV already holds the identical config.
- The NEAR signing path in `publish` is removed (full removal of `bos key` tooling lands separately, gated on the registry ACL verification).
