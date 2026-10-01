# Agents plugin — usage guide

The `agents` plugin re-hosts the NEAR Intents Agent control plane as an
everything.dev plugin: intents custody wallets operated by the platform's
sponsor under the owner's signed policy. The wire contract is generated from
the vendored `@near-intents-agent-api/contracts` schemas, so the public API
surface matches the upstream control plane.

## The three actors

| Actor | Authenticates with | Can do |
|-------|--------------------|--------|
| Owner | NEAR SIWN session | Create agents, sign governance intents, read everything about their agents |
| Grant holder | `x-grant-token` header | Execute within the grant's scope: swap, withdraw, transfer, sign messages |
| MCP client | `x-api-key` (Settings → API Keys) | Everything the API exposes, as generated tools |

## Owner flow

1. Sign in with your NEAR wallet (SIWN). The session binds you as an owner.
2. Open **Agents** in the sidebar (or `POST /api/rpc/agents/generateIntent`
   with `type: "agent_create"`). The first intent creates the agent and its
   custody wallet.
3. The server builds every byte the owner signs and returns it as
   `intent: { standard, payload }`:
   - **Policy intents** (`agent_create`, `policy_update`, freeze/unfreeze)
     sign as **NEP-366 delegate actions** — the UI calls
     `authClient.near.buildSignedDelegateAction(...)`.
   - **Consent intents** (`grant_issue`, `grant_revoke`, `budget_set`,
     `timelock_set`, …) sign as **NEP-413 messages** — the UI calls
     `Near.signMessage({ message, recipient, nonce })` with the base64
     nonce decoded to bytes.
4. Submit the wallet's output unchanged as
   `submitIntent({ type, correlationId, signedData })` and poll
   `intentStatus` for settlement. Submitting the same signature twice is
   idempotent.

The sponsor relays the wallet's delegate on-chain (gasless for the owner);
sponsor keys come from the `AGENTS_SPONSOR_KEYS` plugin secret. Without
them, sponsor features are disabled and the log explains what is missing.

## Delegated flow (grants)

A grant is the owner's delegation of bounded execution authority to one
token. The token is created **client-side**; only its SHA-256 commitment is
ever sent:

1. `createGrantCredential()` → `{ token: "ngt_…", commitment: <sha256 hex> }`
2. `generateIntent({ type: "grant_issue", label, credential, actions,
   recipients, signingAudiences, expiresAt })` → sign (NEP-413) → submit.
3. Keep the token in your secret manager. Execute with the header:
   `x-grant-token: ngt_…` against the execution routes (`/agents/swap`,
   `/agents/withdraw`, `/agents/transfer`, `/agents/sign-message`, …).

Every execution is checked against three layers at dispatch: the grant's
actions and destinations, the owner's USD spend budget, and the provider
policy. `dry: true` previews a swap or withdraw (provider quote) without
executing. Revoking a grant (`grant_revoke` intent) retracts future work;
work that already reached its dispatch commitment is reported in
`committedCorrelationIds`.

## MCP usage

Every route is generated as an MCP tool from the OpenAPI spec
(`POST /api/mcp`, discovery at `/.well-known/mcp.json`). Owner routes
require a session cookie or `x-api-key`; delegated routes additionally
require the `x-grant-token` header — pass it per call.

## Local development

```bash
bun run dev    # local bos CLI — boots the citynode runtime incl. agents on :3010
```

- `.env` needs `BETTER_AUTH_SECRET` set (auth validate-secrets) and, for the
  submit leg, `AGENTS_SPONSOR_KEYS` (testnet sponsor full-access key).
- The plugin's UI is folder-form (`plugins/agents/ui/`) — the dev harness
  builds it automatically and composes its routes under the authenticated
  mount; the sidebar entry comes from the route's `staticData.nav`.
- Secrets: `AGENTS_DATABASE_URL` (auto-generated from resolved ports in
  dev), `AGENTS_SPONSOR_KEYS`, `AGENTS_SECRET_ENCRYPTION_KEYS`,
  `AGENTS_SECRET_ENCRYPTION_ACTIVE_KEY_ID`.
