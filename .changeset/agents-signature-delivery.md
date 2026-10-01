---
"@everything-dev/agents-plugin": minor
---

Expose the upstream signature-delivery loop — `getSignature` (read a completed signature once, under the grant that authorized it) and `acknowledgeSignature` (erase it server-side, one-time-consume with idempotent acks) — grant-token-gated like `signMessage`, backed by the encrypted operation-artifacts store. Also variablize the runtime wiring: `agentsTrustedOrigins` (required; feeds the runtime's trusted origins) and `agentsServiceUrl` (optional; its hostname is the NEP-413 recipient owners sign into every owner message) replace the hardcoded citynode.app/agents.local placeholders.
