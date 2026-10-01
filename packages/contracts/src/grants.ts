import { z } from "zod";
import { idSchema, nearAccountSchema, ownerProofSchema, ownerWalletSchema } from "./common.js";
import { grantDestinationSchema } from "./destinations.js";

/**
 * An agent grant is the owner's delegation of bounded execution authority to one grant token. A
 * tenant API key only proves which partner is calling; it never selects or carries a grant. Each
 * grant is its own permission: an agent can hold many live grants at once (a dashboard session,
 * Claude, a scheduled bot), and issuing or revoking one never touches another.
 *
 * The partner creates the token and sends only its commitment, so the owner signs the exact
 * credential that will use the grant and this service never sees the token at issuance.
 */
export const agentGrantDomain = "near-intents-agent-api.agent-grant.v4";

/** Grant token: `ngt_` and 32 random bytes in base64url. Keep it on the partner's backend. */
export const grantTokenPattern = /^ngt_[A-Za-z0-9_-]{43}$/;
/** SHA-256 hex of the grant token's UTF-8 bytes. */
export const grantCommitmentSchema = z.string().regex(/^[0-9a-f]{64}$/);
/** The owner-visible name of a grant, shown when signing and on every operation it authorizes. */
export const grantLabelSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[^\p{Cc}]+$/u);

export const agentGrantMessageSchema = z.strictObject({
  domain: z.literal(agentGrantDomain),
  owner: ownerWalletSchema,
  tenant_id: z.string().min(1).max(64),
  agent_id: idSchema,
  /** Immutable provider wallet this grant is scoped to. */
  wallet_id: z.string().min(1).max(256),
  label: grantLabelSchema,
  /** Commitment to the grant token that may use this grant. */
  credential: grantCommitmentSchema,
  /** Empty means "no actions"; use `*` only when the owner truly delegates everything. */
  actions: z.array(z.string().min(1).max(64)).min(1).max(64),
  /** Empty permits internal agent balances only; destinations and signing audiences are explicit. */
  recipients: z.array(grantDestinationSchema).max(256),
  signing_audiences: z.array(z.string().min(1).max(256)).max(256),
  network: z.literal("mainnet"),
  issued_at_ms: z.number().int().nonnegative(),
  expires_at_ms: z.number().int().positive(),
  owner_epoch: z.number().int().positive(),
  nonce: z.string().min(16).max(64),
  recipient: nearAccountSchema,
});

export const legacyAgentGrantMessageSchema = agentGrantMessageSchema
  .omit({ signing_audiences: true, network: true })
  .extend({
    domain: z.literal("near-intents-agent-api.agent-grant.v3"),
    recipients: z.array(z.string()),
  });
export const historicalGrantMessageSchema = z.union([
  agentGrantMessageSchema,
  legacyAgentGrantMessageSchema,
]);

const agentGrantSchema = z.strictObject({
  message: agentGrantMessageSchema,
  proof: ownerProofSchema,
  idempotencyKey: z.string().min(8).max(128),
});

const agentGrantViewSchema = z.strictObject({
  grant_id: idSchema,
  agent_id: idSchema,
  wallet_id: z.string(),
  label: z.string(),
  actions: z.array(z.string()),
  recipients: z.array(grantDestinationSchema),
  signing_audiences: z.array(z.string()),
  issued_at: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  revoked_reason: z.string().nullable(),
  owner_epoch: z.number().int().positive(),
  /** The canonical owner-signed message. The grant's columns must restate it exactly. */
  owner_message: historicalGrantMessageSchema,
});

export type AgentGrantMessage = z.infer<typeof agentGrantMessageSchema>;
export type AgentGrantWrite = z.infer<typeof agentGrantSchema>;
export type AgentGrantView = z.infer<typeof agentGrantViewSchema>;
