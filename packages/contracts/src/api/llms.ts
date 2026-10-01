import { z } from "zod";
import { statusSchema, terminalStatuses } from "./common.js";
import { type EndpointDefinition, endpoints } from "./endpoints.js";
import { generateIntentRequestSchema } from "./intents.js";

/**
 * Plain-text guide at `/llms.txt`, generated from the endpoint registry like the OpenAPI
 * document, so an LLM calling the API over raw HTTP reads the same contract the server enforces.
 */

/** `name`, or `name?` when the field may be omitted from the request. */
function fields(schema: z.ZodType | undefined): string | undefined {
  if (!(schema instanceof z.ZodObject)) return undefined;
  return Object.entries(schema.shape as Record<string, z.ZodType>)
    .map(([name, field]) => (field.safeParse(undefined).success ? `${name}?` : name))
    .join(", ");
}

function endpointLine(endpoint: EndpointDefinition) {
  const notes = [
    endpoint.idempotency === "required" ? "Idempotency-Key required" : undefined,
    endpoint.idempotency === "optional" ? "Idempotency-Key optional" : undefined,
  ].filter(Boolean);
  const query = fields(endpoint.query);
  const body = fields(endpoint.body);
  return [
    `- ${endpoint.method.toUpperCase()} ${endpoint.path}: ${endpoint.summary}.`,
    notes.length ? ` (${notes.join("; ")})` : "",
    query ? `\n  query: ${query}` : "",
    body ? `\n  body: ${body}` : "",
  ].join("");
}

function intentTypeLines() {
  return generateIntentRequestSchema.options.map((option) => {
    const { type, ...rest } = option.shape;
    const names = fields(z.strictObject(rest));
    return `- ${(type as z.ZodLiteral<string>).value}${names ? `: ${names}` : ""}`;
  });
}

function endpointSections() {
  const groups = new Map<string, EndpointDefinition[]>();
  for (const endpoint of Object.values(endpoints) as EndpointDefinition[]) {
    if (endpoint.auth === "session") continue;
    groups.set(endpoint.tag, [...(groups.get(endpoint.tag) ?? []), endpoint]);
  }
  return [...groups].flatMap(([tag, list]) => ["", `### ${tag}`, ...list.map(endpointLine)]);
}

export function buildLlmsText(input: { serverUrl?: string } = {}) {
  const base = input.serverUrl ?? "";
  return [
    "# NEAR Intents Agent API",
    "",
    "> Backend HTTP API for AI agents that trade on NEAR Intents under an owner-signed policy. Shaped like the NEAR Intents 1Click API. No SDK is needed: every call is plain JSON over HTTPS.",
    "",
    `Full schemas: ${base}/openapi.json (OpenAPI 3.1, generated from the same registry as this file).`,
    "",
    "## Conventions",
    "",
    "- Authenticate with the `X-API-Key: naa_…` header. The key belongs to a partner backend; never send it to a browser.",
    "- JSON bodies with camelCase fields. Signed objects (policies, `intent.payload`) keep their own field names; send them back byte-for-byte.",
    "- Execution amounts and balanceRaw are atomic integer strings. Balance entries use assetId and token metadata; balance is an exact token-unit decimal string, or null if decimals are unknown.",
    "- Lists return `{ data, nextCursor }`; pass `cursor=<nextCursor>` for the next page.",
    "- Writes that create work take an `Idempotency-Key` header (8–128 chars of `A-Za-z0-9._:-`). Retry with the same key and body; never reuse a key for new work.",
    "- Errors are JSON:API documents: `{ errors: [{ status, code, title, detail?, source?: { pointer }, meta?: { retryable } }], meta: { requestId } }`. Branch on `errors[0].code` (kebab-case), never on `title`. Retry only when `meta.retryable` is true, honoring `Retry-After`.",
    "",
    "## Owner actions: generate → sign → submit → status",
    "",
    "Anything that needs the owner's wallet (creating an agent, changing its policy, grants, freeze, delete, approval votes, …) is one owner intent:",
    "",
    "1. `POST /v1/generate-intent` with `{ type, ...fields }`. The response has `correlationId`, `signer` (the wallet that must sign), `intent: { standard, payload }`, a human-readable `preview` and `expiresAt`. Store `correlationId`.",
    "2. The owner's wallet signs `intent.payload` unchanged, according to `intent.standard`:",
    "   - `nep413` (NEAR message): `wallet.signMessage({ message, recipient, nonce })` with `nonce` base64-decoded to 32 bytes. signedData: `{ standard, payload, public_key, signature }`.",
    "   - `nep366` (NEAR delegate action): `wallet.signDelegateActions({ delegateActions: [payload] })`. signedData: `{ standard, payload, signedDelegate }` (base64 borsh SignedDelegate).",
    "   - `eip712` (EVM typed data): `signTypedData({ account, ...payload })`. signedData: `{ standard, payload, signature }` (0x, 65 bytes).",
    "   - `webauthn` (passkey): `startAuthentication({ optionsJSON: payload })`. signedData: `{ standard, payload, credential }` (AuthenticationResponseJSON).",
    "3. `POST /v1/submit-intent` with `{ type, correlationId, signedData }`. Resubmitting the same signature is safe.",
    "4. `GET /v1/status?correlationId=…&waitMs=30000` until the status is terminal.",
    "",
    "A policy update is one signature. Read `GET /v1/agents/{agentId}/policy` first and pass its `revision` as `expectedRevision`; on `policy-revision-conflict`, read again and generate a new intent.",
    "",
    "Intent types and their fields (`?` = optional):",
    "",
    ...intentTypeLines(),
    "",
    "## Agent actions",
    "",
    "Swaps, withdrawals, transfers and signing need no owner signature at call time, only `X-Grant-Token` for an active owner grant. Create the token on your backend (`createGrantCredential()` in the SDK), put its `commitment` and a `label` in `grant_issue`, and keep the token: one grant per user session, assistant or bot, each revocable on its own. The API key only identifies you. A grant with no `recipients` covers only the agent's own balances (swaps, shield, unshield, deposits without a refund address); withdrawals, transfers and deposit refund addresses need each destination listed in the signed grant, and signing needs an explicit audience. Each call returns a status with a `correlationId`; track it with `GET /v1/status`. `dry: true` on swap and withdraw returns a quote and needs no Idempotency-Key.",
    "",
    "Grant v4 recipients contain action, kind, chain, network, address, memo (none or exact value), and purpose. signingAudiences are separate. Legacy address-only grants require new consent; they cannot authorize execution after migration.",
    "",
    "## One account, shared rules",
    "",
    "An agent is one financial account. Access belongs to a grant; limits and counted usage belong to the account. Every operation must pass the grant (action, exact destination, expiry), the account's OutLayer policy (tokens, capabilities, per-token limits, approvals, freeze), its USD budget and its execution delay; none overrides or adds allowance to another. A larger USD budget never lifts a per-token limit (`policy-denied`), and a looser policy never widens a grant (`grant-action-denied`, `grant-recipient-denied`): ask the owner to change the layer that refused. Account rule changes apply to every connection; there are no per-grant budgets. A signed policy revision is in force only once `GET /v1/agents/{agentId}/policy` shows `APPLIED` with `providerPolicySynced: true`; until then executions fail with `policy-not-ready`. `/limits` shows configured provider rules, not remaining per-token allowance. `GET /v1/agents/{agentId}/timelock` reports `scheduledCount`; list the executions it holds with `GET /v1/agents/{agentId}/timelock/scheduled`, following `nextCursor`.",
    "",
    "## Spending budget",
    "",
    "One account budget is shared by humans, agents, scripts and all grants. Signed limit changes never reset usage. Once configured, usage remains tracked even while caps are cleared. The owner can cap what an account spends in USD across all assets, on top of the per-asset limits in its policy: `budget_set` with any of `dailyUsd`, `weeklyUsd`, `monthlyUsd` (rolling 24 hours, 7 days, 30 days; an omitted window is uncapped, and each call replaces the previous caps). Swaps, withdrawals and transfers count at their USD value when they dispatch, priced from a 1Click quote under 10 minutes old whose decimals match OutLayer's (the same rule `GET /v1/tokens` applies: `price` is null otherwise, and unusable after `priceExpiresAt`); shield, unshield and deposits do not. A cap the owner sets before an execution dispatches applies to it, including one queued earlier; a dispatch that already happened is never retracted. `GET /v1/agents/{agentId}/budget` shows each cap, what is charged (including work whose outcome is still uncertain) and what remains. An execution over the remaining budget fails with `spend-budget-exceeded` (403); one for an asset with no current price fails with `spend-price-unavailable` (503). Neither reaches the provider, and the operation records that refusal: replaying its Idempotency-Key returns it, so once budget frees up send a new key for a new attempt. Never send a new key for an operation that is uncertain or already dispatched; read its status instead.",
    "",
    "## Status values",
    "",
    `${statusSchema.options.map((status) => `\`${status}\``).join(", ")}. Terminal: ${terminalStatuses.map((status) => `\`${status}\``).join(", ")}.`,
    "",
    "`UNCERTAIN` means the outcome is unknown: keep polling the same correlationId and never resubmit under a new Idempotency-Key. `PENDING_SIGNATURE` means the intent still waits for the owner's wallet.",
    "",
    "## Endpoints",
    ...endpointSections(),
    "",
  ].join("\n");
}
