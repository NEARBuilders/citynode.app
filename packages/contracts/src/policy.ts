import { z } from "zod";
import { idSchema, nearAccountSchema } from "./common.js";
import { evmWalletRequestMessageSchema } from "./evm-wallet.js";
import { walletRequestMessageSchema } from "./wallet-request.js";

const nonEmptyPolicyString = z.string().min(1).max(256);
const amountRawSchema = z.string().regex(/^[0-9]{1,78}$/);

export const policyTransactionTypeSchema = z.enum([
  "call",
  "confidential",
  "cross_chain_withdraw",
  "delete",
  "intents_transfer",
  "nft_transfer",
  "swap",
  "transfer",
  "withdraw",
]);

const deniedCapabilitySchema = z.strictObject({
  allowed: z.boolean(),
  requires_approval: z.boolean(),
});

const signingCapabilitySchema = z.strictObject({
  allowed: z.boolean(),
  raw_tx: z.boolean(),
});

const messageCapabilitySchema = z.strictObject({
  allowed: z.boolean(),
  requires_approval: z.boolean(),
  allowed_recipients: z.array(nearAccountSchema).max(256),
});

const rawSigningCapabilitySchema = z.strictObject({
  allowed: z.boolean(),
  chains: z.array(nonEmptyPolicyString).max(64),
  requires_approval: z.boolean(),
});

const policyCapabilitiesSchema = z.strictObject({
  confidential: deniedCapabilitySchema,
  cross_chain_withdraw: deniedCapabilitySchema,
  evm_sign: signingCapabilitySchema,
  raw_sign: rawSigningCapabilitySchema,
  sign_message: messageCapabilitySchema,
  swap: deniedCapabilitySchema,
});

const policyLimitBucketSchema = z.record(z.string().min(1).max(256), amountRawSchema);

const policyLimitsSchema = z.strictObject({
  per_transaction: policyLimitBucketSchema.optional(),
  hourly: policyLimitBucketSchema.optional(),
  daily: policyLimitBucketSchema.optional(),
  monthly: policyLimitBucketSchema.optional(),
});

const policyAddressesSchema = z.strictObject({
  mode: z.enum(["whitelist", "blacklist"]),
  list: z.array(nearAccountSchema).max(256),
});

const policyRulesSchema = z.strictObject({
  allowed_tokens: z.array(nonEmptyPolicyString).max(128),
  transaction_types: z.array(policyTransactionTypeSchema).max(16),
  limits: policyLimitsSchema.optional(),
  rate_limit: z
    .strictObject({ max_per_hour: z.number().int().positive().max(1_000_000) })
    .optional(),
  addresses: policyAddressesSchema.optional(),
  items: z.record(nearAccountSchema, z.array(nonEmptyPolicyString).max(128)).optional(),
});

const policyApprovalSchema = z.strictObject({
  approvers: z
    .array(
      z.strictObject({
        id: nearAccountSchema,
        pubkey: z.string().startsWith("ed25519:").max(80),
        role: z.enum(["admin", "signer"]),
      }),
    )
    .max(32),
  excluded_types: z.array(policyTransactionTypeSchema).max(16),
  threshold: z.strictObject({ required: z.number().int().positive().max(32) }),
});

/** Versioned provider-policy envelope. Canonical JSON of this value is hashed and signed. */
export const policySchema = z.strictObject({
  version: z.literal(1),
  capabilities: policyCapabilitiesSchema,
  frozen: z.boolean(),
  rules: policyRulesSchema,
  approval: policyApprovalSchema.optional(),
});

const revisionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Owner-signed NEP-366 delegate used to submit a provider policy update. */
const policyDelegateDecimal = z.string().regex(/^(0|[1-9][0-9]{0,38})$/);

export const policyDelegateSchema = z.strictObject({
  senderId: nearAccountSchema,
  publicKey: z.string().startsWith("ed25519:").max(80),
  receiverId: nearAccountSchema,
  nonce: policyDelegateDecimal,
  maxBlockHeight: policyDelegateDecimal,
  actions: z
    .array(
      z.strictObject({
        methodName: z.enum(["store_wallet_policy", "freeze_wallet", "unfreeze_wallet"]),
        argsBase64: z.string().max(30000),
        gas: policyDelegateDecimal,
        depositYocto: policyDelegateDecimal,
      }),
    )
    .min(1)
    .max(2),
});
export const nearPolicyRequestSchema = z.strictObject({
  receiver_id: nearAccountSchema,
  actions: policyDelegateSchema.shape.actions,
});
export const signedNearPolicySchema = z.strictObject({
  signedDelegate: z.string().min(32).max(50_000),
});

/** Exact provider rules read back for a bound agent. Raw amounts are decimal strings. */
const policyViewSchema = z.strictObject({
  wallet_id: z.string().min(1).max(256),
  policy_hash: idSchema.nullable(),
  revision: revisionSchema.nullable(),
  status: z.enum(["none", "signed", "applied", "failed"]),
  applied_at: z.string().nullable(),
  transaction_hash: z.string().max(128).nullable(),
  provider_policy_synced: z.boolean(),
  policy: policySchema.nullable(),
});

const limitsViewSchema = z.strictObject({
  wallet_id: z.string().min(1).max(256),
  frozen: z.boolean().nullable(),
  capabilities: policyCapabilitiesSchema.nullable(),
  limits: policyLimitsSchema.nullable(),
  rate_limit: z
    .strictObject({ max_per_hour: z.number().int().positive().max(1_000_000) })
    .nullable(),
  addresses: policyAddressesSchema.nullable(),
  allowed_tokens: z.array(nonEmptyPolicyString).nullable(),
  transaction_types: z.array(policyTransactionTypeSchema).nullable(),
  approval: policyApprovalSchema.nullable(),
  policy_synced: z.boolean(),
});

export const policyOperationResultSchema = z
  .object({
    operation_id: idSchema,
    status: z.enum([
      "pending",
      "pending_wallet_signature",
      "dispatching",
      "submitted",
      "applied",
      "failed",
    ]),
    wallet_id: z.string().min(1).max(256),
    policy_hash: idSchema,
    expected_revision: revisionSchema,
    transaction_hash: z.string().max(128).nullable(),
    submitted: z.boolean(),
    provider_policy_readback: z.boolean(),
    feePayer: z.literal("backend").nullable(),
    controller_id: nearAccountSchema.nullable(),
    receiver_id: nearAccountSchema.nullable(),
    gas: amountRawSchema.nullable(),
    storage_deposit_yocto: amountRawSchema.nullable(),
    delegate: policyDelegateSchema.optional(),
    near_policy_request: nearPolicyRequestSchema.optional(),
    wallet_request: z.union([walletRequestMessageSchema, evmWalletRequestMessageSchema]).optional(),
  })
  .passthrough();

export type Policy = z.infer<typeof policySchema>;
export type PolicyDelegate = z.infer<typeof policyDelegateSchema>;
export type SignedNearPolicy = z.infer<typeof signedNearPolicySchema>;
export type PolicyView = z.infer<typeof policyViewSchema>;
export type LimitsView = z.infer<typeof limitsViewSchema>;
export type PolicyOperationResult = z.infer<typeof policyOperationResultSchema>;
const policyHistorySchema = z.strictObject({
  policies: z.array(policyViewSchema.omit({ provider_policy_synced: true })),
  next_before_revision: revisionSchema.nullable(),
});
export type PolicyHistory = z.infer<typeof policyHistorySchema>;
