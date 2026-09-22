---
"@everything-dev/auth-plugin": minor
"better-near-auth": minor
"everything-dev": minor
---

Add mobile-to-desktop sign-in and passkey-derived NEAR wallets:

- RFC 8628 device authorization flow (official Better Auth `deviceAuthorization` plugin, first-party session path with the `citynode-web` client), a `/device-link/claim` endpoint that exchanges the polled session token for an httpOnly cookie, and auth-plugin UI pages for QR pairing (`/login` "sign in with phone"), `/device` code verification, and `/device/approve` approval.
- SIWN now accepts NEP-616 deterministic (`0s…`) passkey wallet-contract accounts: the server verifies the WebAuthn proof locally (challenge = NEP-413 payload hash, UV required) and pins trust to the canonical Trezu wallet-contract factories by deriving the account id from the passkey public key (NEP-616).
- `siwnClient` gains a `wallets` option for registering sandbox wallet executors (e.g. `passkeyWalletManifest`, registered on mainnet in the shared auth client factory).
