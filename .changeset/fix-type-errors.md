---
"everything-dev": patch
"ui": patch
---

Remove stale `auth-client.gen.ts` and fix UI implicit-any TypeScript errors.

- **everything-dev**: Removed `api/src/auth-client.gen.ts` from the `typesGen` generated file list in `plugin.ts`. This file was consolidated into `plugins-client.gen.ts` in a previous release but the metadata still referenced it, causing confusion when the stale file was left in workspaces.

- **ui**: Added explicit type annotations to callback parameters in:
  - `src/routes/_layout/login.tsx`: `onError` callbacks for NEAR sign-in, passkey, anonymous, email, phone OTP, and GitHub social login.
  - `src/routes/_layout/apps/$accountId/$gatewayId.tsx`: `TransactionBuilder` parameter in two `buildSignedDelegateAction` calls.

These fixes resolve `noImplicitAny` errors under `strict` mode without changing runtime behavior.
