---
"everything-dev": patch
---

Fix FastDATA KV publish for mainnet accounts and eliminate false txHash extraction.

**Namespace mismatch:** `getRegistryNamespaceForAccount` previously defaulted to the publishing account itself on mainnet (e.g., `auth.everything.near`), while the registry plugin expected `dev.everything.near`. This caused `bos publish` to write data to `dev.everything.near` but verify from the account's own namespace, resulting in missing apps.

**False txHash:** The fallback regex `/([A-HJ-NP-Za-km-z1-9]{43,44})/` greedily matched receipt IDs, block hashes, or other base58 strings from NEAR CLI error output. This reported fake txHashes and "published" status even when the transaction never reached the network.

- **fastkv.ts**: Changed mainnet default from `accountId` to `"dev.everything.near"`.
- **near-cli.ts**: Removed greedy base58 fallback. `softSuccess` (FastDATA `CodeDoesNotExist`) now requires an explicit `Transaction ID:` in NEAR CLI output. Returns `undefined` instead of fake hashes.
- **plugin.ts**: `extractTransactionHash` no longer matches random base58 strings.
- **.env.example**: Documented `REGISTRY_FASTKV_*` environment variables.
