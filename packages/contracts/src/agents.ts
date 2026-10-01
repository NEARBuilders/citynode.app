import { z } from "zod";
import {
  idSchema,
  nearAccountSchema,
  nearPublicKeySchema,
  ownerNearSchema,
  ownerProofSchema,
  ownerWalletSchema,
  signedMessageFields,
  usdAmountSchema,
} from "./common.js";
import { balanceEntrySchema } from "./tokens.js";

/** Owner-signed archive and restore; wallet recovery and rotation are not supported. */
const agentControlMessageSchema = z.strictObject({
  domain: z.literal("near-intents-agent-api.agent-control.v3"),
  ...signedMessageFields,
  action: z.enum(["archive", "restore"]),
  previous_public_key: nearPublicKeySchema,
});

const agentControlSchema = z.strictObject({
  message: agentControlMessageSchema,
  proof: ownerProofSchema,
});

const ownerAdminCommandFields = {
  domain: z.literal("near-intents-agent-api.owner-admin.v2"),
  owner: ownerWalletSchema,
  tenant_id: idSchema,
  agent_id: idSchema,
  network: z.literal("mainnet"),
  owner_epoch: z.number().int().positive(),
  /** Exact target id or canonical settings hash for this command. */
  target_id: idSchema,
  recipient: z.string().min(1).max(253),
  nonce: idSchema,
  issued_at_ms: z.number().int().nonnegative(),
  expires_at_ms: z.number().int().positive(),
};

const agentGrantRevocationMessageSchema = z.strictObject({
  ...ownerAdminCommandFields,
  action: z.literal("revoke_grant"),
});

const timelockSettingsSchema = z.strictObject({
  delay_seconds: z
    .number()
    .int()
    .min(0)
    .max(30 * 24 * 60 * 60),
});
const timelockMessageSchema = z.strictObject({
  ...ownerAdminCommandFields,
  action: z.literal("set_timelock"),
  delay_seconds: timelockSettingsSchema.shape.delay_seconds,
  expected_revision: z.number().int().nonnegative(),
});
const timelockWriteSchema = z.strictObject({
  message: timelockMessageSchema,
  proof: ownerProofSchema,
});
/** `null` leaves that window uncapped. */
const budgetSettingsSchema = z.strictObject({
  daily_usd: usdAmountSchema.nullable(),
  weekly_usd: usdAmountSchema.nullable(),
  monthly_usd: usdAmountSchema.nullable(),
});
const budgetMessageSchema = z.strictObject({
  ...ownerAdminCommandFields,
  action: z.literal("set_budget"),
  ...budgetSettingsSchema.shape,
  expected_revision: z.number().int().nonnegative(),
});
const budgetWriteSchema = z.strictObject({
  message: budgetMessageSchema,
  proof: ownerProofSchema,
});
const executionCancellationMessageSchema = z.strictObject({
  ...ownerAdminCommandFields,
  action: z.literal("cancel_execution"),
});
const executionCancellationSchema = z.strictObject({
  message: executionCancellationMessageSchema,
  proof: ownerProofSchema,
});
const budgetWindowUsageSchema = z.strictObject({
  limit_usd: usdAmountSchema.nullable(),
  spent_usd: z.string(),
  remaining_usd: z.string().nullable(),
  /** When the oldest counted spend leaves the window; null when nothing is counted. */
  resets_at: z.iso.datetime().nullable(),
});
const budgetViewSchema = z.strictObject({
  daily: budgetWindowUsageSchema,
  weekly: budgetWindowUsageSchema,
  monthly: budgetWindowUsageSchema,
  revision: z.number().int().nonnegative(),
  enforced_by: z.literal("agent_api"),
});
const timelockViewSchema = z.strictObject({
  delay_seconds: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  /** Executions waiting for release or being dispatched; list them page by page. */
  scheduled_count: z.number().int().nonnegative(),
  enforced_by: z.literal("agent_api"),
});
const scheduledExecutionSchema = z.strictObject({
  operation_id: idSchema,
  execute_after: z.iso.datetime(),
  state: z.enum(["waiting", "dispatching"]),
  action: z.string().nullable(),
});
export type TimelockSettings = z.infer<typeof timelockSettingsSchema>;
export type TimelockMessage = z.infer<typeof timelockMessageSchema>;
export type TimelockWrite = z.infer<typeof timelockWriteSchema>;
export type TimelockView = z.infer<typeof timelockViewSchema>;
export type ScheduledExecution = z.infer<typeof scheduledExecutionSchema>;
export type BudgetSettings = z.infer<typeof budgetSettingsSchema>;
export type BudgetMessage = z.infer<typeof budgetMessageSchema>;
export type BudgetWrite = z.infer<typeof budgetWriteSchema>;
export type BudgetView = z.infer<typeof budgetViewSchema>;
export type ExecutionCancellation = z.infer<typeof executionCancellationSchema>;

const agentAdminCommandMessageSchema = z.discriminatedUnion("action", [
  agentGrantRevocationMessageSchema,
  timelockMessageSchema,
  budgetMessageSchema,
  executionCancellationMessageSchema,
]);

const agentGrantRevocationSchema = z.strictObject({
  message: agentGrantRevocationMessageSchema,
  proof: ownerProofSchema,
});

/**
 * The owner's one signature that deletes an agent. The server issues it through the delete
 * challenge: `beneficiary` is always the service sponsor account, which receives the custody
 * account's native NEAR. Public and confidential balances still in the wallet are lost.
 */
const agentDeleteMessageSchema = z.strictObject({
  domain: z.literal("near-intents-agent-api.agent-delete.v3"),
  ...signedMessageFields,
  beneficiary: nearAccountSchema,
  chain: z.literal("near"),
  confirm_asset_loss: z.literal(true),
});

const agentDeleteSchema = z.strictObject({
  message: agentDeleteMessageSchema,
  proof: ownerProofSchema,
  idempotencyKey: z.string().min(8).max(128),
});

export const walletSchema = z.strictObject({
  wallet_id: z.string().min(1).max(256),
  near_account_id: nearAccountSchema,
  evm_address: z
    .string()
    .regex(/^0x[0-9a-f]{40}$/)
    .nullable(),
});

/**
 * `pending`: created, waiting for the owner's single onboarding signature to land on chain.
 * `abandoned`: the onboarding request expired or failed; the agent never becomes usable.
 */
const agentStatusSchema = z.enum(["pending", "active", "archived", "deleted", "abandoned"]);

export const agentViewSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  externalUserId: z.string().nullable(),
  status: agentStatusSchema,
  archived: z.boolean().optional(),
  deleted: z.boolean(),
  ownerWallet: ownerWalletSchema.nullable(),
  ownerNear: ownerNearSchema.nullable(),
  wallet: walletSchema.nullable(),
  createdAt: z.string(),
});

const balanceListSchema = z.strictObject({
  near_account_id: nearAccountSchema,
  source: z.enum(["public", "confidential"]),
  balances: z.array(balanceEntrySchema).max(4096),
});

export type Wallet = z.infer<typeof walletSchema>;
export type AgentView = z.infer<typeof agentViewSchema>;
/**
 * What deleting the agent does to its funds, read when the challenge is issued. Balances can
 * still change before the owner signs; the owner empties the wallet (for example by asking the
 * agent to withdraw) before deleting.
 */
const agentDeletePreviewSchema = z.strictObject({
  near_account_id: nearAccountSchema,
  /** Receives the custody account's native NEAR when the account is deleted. */
  beneficiary: nearAccountSchema,
  native_balance: z.string().regex(/^[0-9]{1,78}$/),
  /** Non-zero public balances that deletion destroys. */
  public: z.array(balanceEntrySchema).max(4096),
  /** Non-zero confidential balances that deletion destroys. */
  confidential: z.array(balanceEntrySchema).max(4096),
  /** True when any Intents or confidential balance would be lost. */
  assets_lost: z.boolean(),
  /**
   * `provider_delete`: the custody account exists on chain and OutLayer deletes it, sending its
   * native NEAR to `beneficiary`. `credential_erase`: the account was never created on chain (an
   * Intents-only wallet never holds native NEAR), so there is nothing to delete; the API retires
   * the wallet by erasing its only custody credential.
   */
  retirement: z.enum(["provider_delete", "credential_erase"]),
  /**
   * False only for `provider_delete` under a policy whose `transaction_types` lacks `delete`:
   * OutLayer would refuse the deletion, so the owner adds the type with a policy update first.
   */
  policy_allows_delete: z.boolean(),
});

export const agentDeletionChallengeSchema = z.strictObject({
  message: agentDeleteMessageSchema,
  preview: agentDeletePreviewSchema,
});

export type BalanceEntry = z.infer<typeof balanceEntrySchema>;
export type AgentDeletePreview = z.infer<typeof agentDeletePreviewSchema>;
export type AgentDeletionChallenge = z.infer<typeof agentDeletionChallengeSchema>;
export type BalanceList = z.infer<typeof balanceListSchema>;

/** Lists hold every held asset, so no token is required. */
const balanceListQuerySchema = z.strictObject({
  source: z.enum(["public", "confidential"]),
});
export type BalanceListQuery = z.infer<typeof balanceListQuerySchema>;

export type AgentControl = z.infer<typeof agentControlSchema>;
export type AgentControlMessage = z.infer<typeof agentControlMessageSchema>;
export type AgentAdminCommandMessage = z.infer<typeof agentAdminCommandMessageSchema>;
export type AgentGrantRevocation = z.infer<typeof agentGrantRevocationSchema>;
export type AgentDelete = z.infer<typeof agentDeleteSchema>;
export type AgentDeleteMessage = z.infer<typeof agentDeleteMessageSchema>;
