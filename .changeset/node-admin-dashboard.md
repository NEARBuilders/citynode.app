---
"api": patch
"ui": minor
---

Add the organization-scoped My Node dashboard with node selection, structure and validator statistics, staking resolution, node proposals, and role-aware review actions. Add tenant filtering to `listNodes` so the dashboard resolves only nodes managed by the active organization. Refresh session data after organization switches so the dashboard immediately follows the selected organization. Make tenant deployment network-aware, use the connected wallet's actual public key for subaccount creation, and pass the testnet parent key into the auth runtime.
