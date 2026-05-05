---
"ui": patch
"api": patch
"@everything-dev/auth-plugin": patch
---

Fix build and test issues after switching to local better-near-auth

- Added `@hot-labs/near-connect@0.11.2` as a root dependency and override to resolve missing prebuilt artifacts from the GitHub version
- Fixed duplicate `"clsx"` key in `ui/package.json` that caused `bun install` warnings
- Updated `better-near-auth` API usage in `$gatewayId.tsx` to match new `buildSignedDelegateAction(receiverId, builderFn)` signature and `relayTransaction({ payload })` shape
- Fixed `deposit` → `attachedDeposit: 0n` to satisfy `AmountInput` type requirements
- Removed unused `normalizePath` function in `plugins/auth/rspack.config.js`
- Fixed `EmitPluginManifest` `srcPath` from `"types/auth-export.d.ts"` to `"auth-export.d.ts"` (plugin already prefixes `types/`)
- Added `--root .` to `api` vitest scripts to prevent test discovery leaking into other workspace packages
