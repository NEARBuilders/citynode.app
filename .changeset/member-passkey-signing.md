---
"ui": minor
---

Add a member signing adapter for Passkey Wallets. `ui/src/lib/member-wallet.ts` exposes a `SessionWallet` for `proposeAsSession` built from better-near-auth's `passkeyWalletManifest`, with its own NEAR Connect instance and storage, separate from the Trezu DAO connection. It only signs as the session-linked account, maps failures to cancelled, unavailable passkey, network or sender failure and contract rejection, and guards against duplicate submission. `useMemberSigning` and `MemberSigningStatus` cover the signing states, with strings in every locale. No screen uses it yet; the passkey credential bridge and the sender come from the activation spike.
