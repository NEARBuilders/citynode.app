---
"everything-dev": patch
---

Fix FastDATA KV publish namespace default for mainnet accounts.

`getRegistryNamespaceForAccount` in `packages/everything-dev/src/fastkv.ts` previously defaulted to the publishing account itself on mainnet (e.g., `auth.everything.near`), while the registry plugin and the publish transaction both used `dev.everything.near`. This mismatch caused `bos publish` to write data to the shared `dev.everything.near` namespace but then verify (and the registry discovery to read) from the account's own namespace, resulting in missing apps for any account other than `dev.everything.near`.

- **fastkv.ts**: Changed mainnet default from `accountId` to `"dev.everything.near"` so all mainnet accounts publish to the shared registry namespace by default.
- **.env.example**: Added `REGISTRY_FASTKV_MAINNET_NAMESPACE`, `REGISTRY_FASTKV_TESTNET_NAMESPACE`, `REGISTRY_FASTKV_MAINNET_URL`, and `REGISTRY_FASTKV_TESTNET_URL` to document overrides.
