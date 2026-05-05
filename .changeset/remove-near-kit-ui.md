---
"ui": minor
---

Remove near-kit dependency from UI. Delete near-client.ts wrapper and refactor gateway page to use authClient.near (buildSignedDelegateAction, relayTransaction) directly via better-near-auth.
