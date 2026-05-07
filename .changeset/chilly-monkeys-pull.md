---
"everything-dev": patch
---

Fix `resolveContractSource` localPath truthiness bug caused by Zod optional keys.

Zod includes optional keys as `undefined` on parsed objects, which made the `localPath` truthiness checks in `resolveContractSource` evaluate to `false` even when the key was present. This caused the contract-source resolver to skip local fallbacks for `api` and `auth` keys and incorrectly fall through to `remoteContractSource` with an empty base URL, producing `fetch() URL is invalid` during postinstall.

Changed the gate conditions for `api` and `auth` keys to always enter their local-handling blocks, and switched the inner/localPath checks from truthiness to explicit `!= null` plus empty-string guards.
