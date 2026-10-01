import { z } from "zod";
import {
  idSchema,
  nearAccountSchema,
  ownerProofSchema,
  ownerSigningRequestSchema,
  signedMessageFields,
} from "./common.js";

const operationKindSchema = z.enum(["sign", "execute", "relay", "policy"]);
/** Command completion is not proof of transaction broadcast or settlement. */
export const operationStatusSchema = z.enum(["pending", "completed", "uncertain", "failed"]);

const operationSchema = z.strictObject({
  id: idSchema,
  kind: operationKindSchema,
  status: operationStatusSchema,
  result: z.unknown(),
});

export type OperationKind = z.infer<typeof operationKindSchema>;
export type OperationStatus = z.infer<typeof operationStatusSchema>;
export type Operation<T = unknown> = Omit<z.infer<typeof operationSchema>, "result"> & {
  result: T;
};

const idempotencyKeySchema = z.string().min(8).max(128);

export const evmChainSchema = z.enum([
  "ethereum",
  "base",
  "arbitrum",
  "bsc",
  "polygon",
  "optimism",
  "avalanche",
]);

/** The only detached payload admitted to signing APIs: a short-lived, audience-bound identity challenge. */
export const identitySigningChallengeSchema = z.strictObject({
  domain: z.literal("near-intents-agent-api.identity.v1"),
  purpose: z.literal("identity"),
  chain: z.union([z.literal("near"), evmChainSchema]),
  audience: z.string().min(1).max(256),
  /** Relying-party generated 32-byte random challenge; relying-party verifier enforces one-time use. */
  challenge: z.string().regex(/^[0-9a-f]{64}$/),
  issued_at_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  expires_at_ms: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

const signMessageSchema = z.strictObject({
  message: z.string().max(32768),
  encoding: z.enum(["utf8", "hex"]).optional(),
  recipient: nearAccountSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});

const evmSignMessageSchema = z.strictObject({
  message: z.string().max(32768),
  encoding: z.enum(["utf8", "hex"]).optional(),
  chain: evmChainSchema,
  idempotencyKey: idempotencyKeySchema,
});

const evmSignTypedDataSchema = z.strictObject({
  chain: evmChainSchema,
  typed_data: z.strictObject({
    domain: z.record(z.string(), z.unknown()),
    types: z.record(z.string(), z.unknown()),
    primaryType: z.string().min(1).max(128),
    message: z.record(z.string(), z.unknown()),
  }),
  idempotencyKey: idempotencyKeySchema,
});

const evmSignTransactionSchema = z.strictObject({
  chain: evmChainSchema,
  unsigned_tx: z
    .string()
    .regex(/^0x[0-9a-fA-F]+$/)
    .max(100_000),
  idempotencyKey: idempotencyKeySchema,
});

const swapSchema = z.strictObject({
  token_in: z.string().min(1).max(128),
  token_out: z.string().min(1).max(128),
  amount_in: z.string().regex(/^[0-9]{1,78}$/),
  min_amount_out: z
    .string()
    .regex(/^[0-9]{1,78}$/)
    .optional(),
  confidential: z.boolean().optional(),
  idempotencyKey: idempotencyKeySchema,
});

const withdrawSchema = z.strictObject({
  token: z.string().min(1).max(128),
  amount: z.string().regex(/^[0-9]{1,78}$/),
  chain: z.string().min(1).max(64),
  to: z.string().min(1).max(128),
  memo: z.string().max(256).optional(),
  confidential: z.boolean().optional(),
  /** Cross-chain 1Click bridges outlive the synchronous window; async returns a poll_url. */
  async: z.boolean().optional(),
  idempotencyKey: idempotencyKeySchema,
});

/** Moves an amount of one token between the agent's own public and confidential balances. */
const intentsBalanceMoveSchema = z.strictObject({
  token: z.string().min(1).max(128),
  amount: z.string().regex(/^[0-9]{1,78}$/),
  idempotencyKey: idempotencyKeySchema,
});

const tokenTransferSchema = z.strictObject({
  token: z.string().min(1).max(256),
  amount: z.string().regex(/^[0-9]{1,78}$/),
  to: nearAccountSchema,
  idempotencyKey: idempotencyKeySchema,
});
const crossChainDepositSchema = z
  .strictObject({
    source_asset: z.string().min(1).max(256).optional(),
    destination_asset: z.string().min(1).max(256).optional(),
    amount: z.string().regex(/^[0-9]{1,78}$/),
    chain: z.string().min(1).max(32).optional(),
    token: z.string().min(1).max(128).optional(),
    refund_address: z.string().min(1).max(256).optional(),
    confidential: z.boolean().optional(),
    idempotencyKey: idempotencyKeySchema,
  })
  .refine((input) => Boolean(input.source_asset) || Boolean(input.chain), {
    message: "source_asset or chain is required",
  });
export const executionActionSchema = z.enum([
  "swap",
  "withdraw",
  "shield",
  "unshield",
  "intents_transfer",
  "confidential_transfer",
  "confidential_deposit",
  "cross_chain_deposit",
  "delete",
]);

export const executionRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("swap"), request: swapSchema }),
  z.strictObject({ action: z.literal("withdraw"), request: withdrawSchema }),
  z.strictObject({
    action: z.literal("shield"),
    request: intentsBalanceMoveSchema,
  }),
  z.strictObject({
    action: z.literal("unshield"),
    request: intentsBalanceMoveSchema,
  }),
  z.strictObject({ action: z.literal("intents_transfer"), request: tokenTransferSchema }),
  z.strictObject({ action: z.literal("confidential_transfer"), request: tokenTransferSchema }),
  z.strictObject({
    action: z.literal("confidential_deposit"),
    request: intentsBalanceMoveSchema,
  }),
  z.strictObject({ action: z.literal("cross_chain_deposit"), request: crossChainDepositSchema }),
]);

export const executeSchema = executionRequestSchema;

export const signatureSchema = z.strictObject({
  near_account_id: nearAccountSchema,
  nonce: z.string().min(1).max(64),
  recipient: z.string().min(1).max(253),
  signature: z.string().regex(/^[0-9a-f]{128}$/),
  public_key: z.string().startsWith("ed25519:").max(80),
});

export const evmSignatureSchema = z.strictObject({
  evm_address: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

const signingArtifactDeliverySchema = z.strictObject({
  operation_id: idSchema,
  artifact: z.union([signatureSchema, evmSignatureSchema]),
  expires_at: z.string().datetime(),
});

const signingArtifactActionSchema = z.enum([
  "near_message",
  "evm_message",
  "evm_typed_data",
  "evm_transaction",
]);

/** Owner proof permits one-time retrieval or acknowledgement of a protected signature artifact. */
const signingArtifactOwnerActionSchema = z.enum(["read", "ack"]);
export const signingArtifactOwnerMessageSchema = z.strictObject({
  ...signedMessageFields,
  domain: z.literal("near-intents-agent-api.signing-artifact-owner.v2"),
  operation_id: idSchema,
  request_hash: idSchema,
  requesting_key_id: z.string().min(1).max(253),
  grant_id: z.string().min(1).max(253),
  owner_epoch: z.number().int().nonnegative(),
  signing_action: signingArtifactActionSchema,
  action: signingArtifactOwnerActionSchema,
});
const signingArtifactOwnerChallengeSchema = z.strictObject({
  message: signingArtifactOwnerMessageSchema,
  signing: ownerSigningRequestSchema,
  nep413: z.strictObject({ message: z.string(), nonce: idSchema, recipient: z.string() }),
});
const signingArtifactOwnerAccessSchema = z.strictObject({
  message: signingArtifactOwnerMessageSchema,
  proof: ownerProofSchema,
});

export const executionResultSchema = z
  .object({
    action: executionActionSchema,
    near_account_id: nearAccountSchema,
    provider_request_id: z.string().max(128).nullable(),
    /** Set when the request used a `/confidential/*` route, which settles on the private shard. */
    confidential: z.literal(true).optional(),
    /** Destination chain of a withdrawal, as requested. */
    chain: z.string().min(1).max(64).optional(),
    execute_after: z.iso.datetime().optional(),
    delay_seconds: z.number().int().nonnegative().optional(),
    status: z.enum([
      "timelocked",
      "pending",
      "pending_approval",
      "pending_deposit",
      "processing",
      "approved",
      "success",
      "partially_failed",
      "failed",
      "refunded",
      "rejected",
      "expired",
      "cancelled",
      "needs_review",
      "unknown",
    ]),
    approval_id: z.string().nullable().optional(),
    request_hash: z.string().nullable().optional(),
    tx_hash: z.string().nullable().optional(),
    /**
     * Deletion of a custody wallet with no on-chain account (never natively funded): there is
     * nothing for the provider to delete, so the API erased its only copy of the credential.
     */
    credential_erased: z.literal(true).optional(),
    intent_hash: z.string().nullable().optional(),
    transfer_intent_hash: z.string().nullable().optional(),
    destination_tx_hash: z.string().nullable().optional(),
    receipt_id: z.string().max(256).nullable().optional(),
    receipt_hash: z.string().max(256).nullable().optional(),
    settlement_status: z.string().max(64).nullable().optional(),
    settlement_tx_hash: z.string().max(128).nullable().optional(),
    settled_at: z.string().max(128).nullable().optional(),
    refund_tx_hash: z.string().max(128).nullable().optional(),
    refund_status: z.string().max(64).nullable().optional(),
    failure_code: z.string().max(128).nullable().optional(),
    failure_reason: z.string().max(1024).nullable().optional(),
    fee: z.string().max(256).nullable().optional(),
    fee_amount: z.string().max(256).nullable().optional(),
    fee_token: z.string().max(128).nullable().optional(),
    provider_fee: z.string().max(256).nullable().optional(),
    provider_fee_amount: z.string().max(256).nullable().optional(),
    provider_fee_token: z.string().max(128).nullable().optional(),
    solver_fee: z.string().max(256).nullable().optional(),
    solver_fee_amount: z.string().max(256).nullable().optional(),
    solver_fee_token: z.string().max(128).nullable().optional(),
    protocol_fee: z.string().max(256).nullable().optional(),
    protocol_fee_amount: z.string().max(256).nullable().optional(),
    protocol_fee_token: z.string().max(128).nullable().optional(),
    amount_out: z.string().nullable().optional(),
    deposit_address: z.string().nullable().optional(),
    intent_id: z.string().nullable().optional(),
    expires_at: z.string().nullable().optional(),
    estimated_time_secs: z.number().int().nullable().optional(),
    poll_url: z.string().nullable().optional(),
  })
  .passthrough();

export type SignMessage = z.infer<typeof signMessageSchema>;
export type EvmSignMessage = z.infer<typeof evmSignMessageSchema>;
export type EvmSignTypedData = z.infer<typeof evmSignTypedDataSchema>;
export type EvmSignTransaction = z.infer<typeof evmSignTransactionSchema>;
export type IdentitySigningChallenge = z.infer<typeof identitySigningChallengeSchema>;
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
export type Signature = z.infer<typeof signatureSchema>;
export type SigningArtifactDelivery = z.infer<typeof signingArtifactDeliverySchema>;
export type SigningArtifactAction = z.infer<typeof signingArtifactActionSchema>;
export type SigningArtifactOwnerAction = z.infer<typeof signingArtifactOwnerActionSchema>;
export type SigningArtifactOwnerMessage = z.infer<typeof signingArtifactOwnerMessageSchema>;
export type SigningArtifactOwnerChallenge = z.infer<typeof signingArtifactOwnerChallengeSchema>;
export type SigningArtifactOwnerAccess = z.infer<typeof signingArtifactOwnerAccessSchema>;
