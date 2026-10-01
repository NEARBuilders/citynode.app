import { z } from "zod";
import { grantDestinationSchema } from "../destinations.js";
import { balanceEntrySchema, tokenViewSchema } from "../tokens.js";

export { balanceEntrySchema, tokenViewSchema } from "../tokens.js";

import {
  idSchema,
  nearAccountSchema,
  ownerNearSchema,
  ownerWalletSchema,
  usdAmountSchema,
} from "../common.js";
import { historicalGrantMessageSchema } from "../grants.js";
import { policySchema, policyTransactionTypeSchema } from "../policy.js";
import { atomicAmountSchema, correlationIdSchema, pageSchema } from "./common.js";

/**
 * Read models of the public API. Resource and lifecycle states use UPPER_SNAKE values.
 * Policy rules are the owner-signed provider policy and keep its field names.
 */

export const walletViewSchema = z.strictObject({
  walletId: z.string().min(1).max(256),
  nearAccountId: nearAccountSchema,
  evmAddress: z
    .string()
    .regex(/^0x[0-9a-f]{40}$/)
    .nullable(),
});

export const agentViewSchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  externalUserId: z.string().nullable(),
  status: z.enum(["PENDING", "ACTIVE", "ARCHIVED", "DELETED", "ABANDONED"]),
  archived: z.boolean(),
  deleted: z.boolean(),
  /** Public owner identity; null until onboarding lands. */
  owner: ownerWalletSchema.nullable(),
  /** The owner's NEAR authority account: the named account, or its deterministic `0s` wallet. */
  ownerAccount: ownerNearSchema.nullable(),
  wallet: walletViewSchema.nullable(),
  createdAt: z.string(),
});

export const agentListQuerySchema = z.strictObject({
  externalUserId: z.string().min(1).max(200).optional(),
  cursor: idSchema.optional(),
});
export const agentPageSchema = pageSchema(agentViewSchema);

export const balanceSourceSchema = z.enum(["public", "confidential"]);
export const balanceQuerySchema = z.strictObject({
  source: balanceSourceSchema.default("public"),
  asset: z.string().min(1).max(256).optional(),
});
export const balancesViewSchema = z.strictObject({
  nearAccountId: nearAccountSchema,
  source: balanceSourceSchema,
  balances: z.array(balanceEntrySchema).max(4096),
});

export const tokenListViewSchema = z.strictObject({ data: z.array(tokenViewSchema).max(4096) });

export const policyStateSchema = z.enum(["NONE", "SIGNED", "APPLIED", "FAILED"]);
export const policyViewSchema = z.strictObject({
  walletId: z.string().min(1).max(256),
  revision: z.number().int().nonnegative().nullable(),
  policyHash: idSchema.nullable(),
  status: policyStateSchema,
  appliedAt: z.string().nullable(),
  transactionHash: z.string().max(128).nullable(),
  /** True when OutLayer's readback matches the applied revision. */
  providerPolicySynced: z.boolean(),
  policy: policySchema.nullable(),
});
export const policyRevisionViewSchema = policyViewSchema.omit({ providerPolicySynced: true });
export const policyHistoryQuerySchema = z.strictObject({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const policyHistoryViewSchema = z.strictObject({
  data: z.array(policyRevisionViewSchema),
  /** Pass as `cursor` to read older revisions. */
  nextCursor: z.number().int().positive().nullable(),
});

const policyShape = policySchema.shape;
const rulesShape = policyShape.rules.shape;
export const limitsViewSchema = z.strictObject({
  walletId: z.string().min(1).max(256),
  frozen: z.boolean().nullable(),
  capabilities: policyShape.capabilities.nullable(),
  limits: rulesShape.limits.unwrap().nullable(),
  rateLimit: rulesShape.rate_limit.unwrap().nullable(),
  addresses: rulesShape.addresses.unwrap().nullable(),
  allowedTokens: rulesShape.allowed_tokens.nullable(),
  transactionTypes: z.array(policyTransactionTypeSchema).nullable(),
  approval: policyShape.approval.unwrap().nullable(),
  policySynced: z.boolean(),
});

export const grantViewSchema = z.strictObject({
  grantId: idSchema,
  agentId: idSchema,
  walletId: z.string(),
  /** The owner-signed name of this grant. */
  label: z.string(),
  actions: z.array(z.string()),
  recipients: z.array(grantDestinationSchema),
  signingAudiences: z.array(z.string()),
  issuedAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
  revokedReason: z.string().nullable(),
  ownerEpoch: z.number().int().positive(),
  /** The canonical owner-signed grant message; the fields above restate it exactly. */
  ownerMessage: historicalGrantMessageSchema,
});
export const grantListViewSchema = z.strictObject({ data: z.array(grantViewSchema) });

export const timelockViewSchema = z.strictObject({
  delaySeconds: z.number().int().nonnegative(),
  revision: z.number().int().nonnegative(),
  /** Executions waiting for release or being dispatched. List them with `listScheduledExecutions`. */
  scheduledCount: z.number().int().nonnegative(),
  enforcedBy: z.literal("agent_api"),
});
export const scheduledExecutionSchema = z.strictObject({
  correlationId: correlationIdSchema,
  executeAfter: z.iso.datetime(),
  state: z.enum(["waiting", "dispatching"]),
  action: z.string().nullable(),
});
export const scheduledQuerySchema = z.strictObject({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
/** Earliest release first. `nextCursor` is null on the last page. */
export const scheduledPageSchema = z.strictObject({
  data: z.array(scheduledExecutionSchema),
  nextCursor: z.string().nullable(),
});

const budgetWindowViewSchema = z.strictObject({
  /** The owner's cap for this window in USD; null when the window is uncapped. */
  limitUsd: usdAmountSchema.nullable(),
  /** USD counted in the window, six decimals. */
  spentUsd: z.string(),
  remainingUsd: z.string().nullable(),
  /** When the oldest counted spend leaves the window; null when nothing is counted. */
  resetsAt: z.iso.datetime().nullable(),
});

/** Owner-signed USD spend caps enforced by this API on top of the provider's per-asset limits. */
export const budgetViewSchema = z.strictObject({
  daily: budgetWindowViewSchema,
  weekly: budgetWindowViewSchema,
  monthly: budgetWindowViewSchema,
  revision: z.number().int().nonnegative(),
  enforcedBy: z.literal("agent_api"),
});

export const approvalViewSchema = z.strictObject({
  approvalId: z.uuid(),
  walletId: z.string().min(1),
  walletPubkey: z.string().min(1),
  requestHash: z.string().min(1),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXPIRED"]),
  requestType: z.string(),
  requestData: z.record(z.string(), z.unknown()),
  requiredApprovals: z.number().int().positive(),
  expiresAt: z.string(),
});

export const networkViewSchema = z.strictObject({
  network: z.literal("mainnet"),
  contractId: nearAccountSchema,
  supportedOwnerTypes: z.array(z.enum(["near", "evm", "passkey"])),
  intents: z.enum(["available", "provider_limited"]),
});

export const whoamiViewSchema = z.strictObject({
  apiKeyId: z.string(),
  tenantId: z.string(),
});

export const containmentQuerySchema = z.strictObject({
  grantsCursor: idSchema.optional(),
  operationsCursor: idSchema.optional(),
});
const inventorySchema = z.strictObject({
  hasMore: z.boolean(),
  nextCursor: z.string().nullable(),
  data: z.array(z.record(z.string(), z.unknown())),
});
export const containmentViewSchema = z.strictObject({
  generatedAt: z.string(),
  wallet: z
    .strictObject({
      walletId: z.string().nullable(),
      nearAccountId: z.string().nullable(),
      evmAddress: z.string().nullable(),
      status: z.string(),
    })
    .nullable(),
  grants: inventorySchema,
  pendingOperations: inventorySchema,
  providerBoundary: z.strictObject({
    enforcement: z.literal("unverified"),
    directProviderKeyBypass: z.literal("unverified"),
  }),
});

export const deletionPreviewSchema = z.strictObject({
  nearAccountId: nearAccountSchema,
  /** Receives the custody account's native NEAR when the account is deleted. */
  beneficiary: nearAccountSchema,
  nativeBalance: atomicAmountSchema,
  /** Non-zero public balances that deletion destroys. */
  public: z.array(balanceEntrySchema),
  /** Non-zero confidential balances that deletion destroys. */
  confidential: z.array(balanceEntrySchema),
  assetsLost: z.boolean(),
  retirement: z.enum(["provider_delete", "credential_erase"]),
  policyAllowsDelete: z.boolean(),
});

export const nearSignatureArtifactSchema = z.strictObject({
  chain: z.literal("near"),
  nearAccountId: nearAccountSchema,
  publicKey: z.string(),
  recipient: z.string(),
  nonce: z.string(),
  signature: z.string().regex(/^[0-9a-f]{128}$/),
});
export const evmSignatureArtifactSchema = z.strictObject({
  chain: z.string(),
  evmAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});
export const signatureDeliverySchema = z.strictObject({
  correlationId: correlationIdSchema,
  artifact: z.union([nearSignatureArtifactSchema, evmSignatureArtifactSchema]),
  expiresAt: z.string(),
});
export const acknowledgementSchema = z.strictObject({ acknowledged: z.literal(true) });

export const developerKeySchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  prefix: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable(),
});
export const developerKeyListSchema = z.strictObject({ data: z.array(developerKeySchema) });
export const createdDeveloperKeySchema = developerKeySchema.extend({
  /** Plaintext key. Shown once; store it in a secret manager. */
  token: z.string(),
});
export const createDeveloperKeySchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  expiresAt: z.iso.datetime(),
});
export const revocationViewSchema = z.strictObject({
  revoked: z.literal(true),
  /** Delegated work that reached its dispatch commitment before the revocation. */
  committedCorrelationIds: z.array(correlationIdSchema),
  /** True when more work than `committedCorrelationIds` lists had committed; the list holds the oldest. */
  committedTruncated: z.boolean(),
});
export const developerDashboardSchema = z.strictObject({
  agents: z.number().int().nonnegative(),
  operations: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  uncertain: z.number().int().nonnegative(),
  settled: z.number().int().nonnegative(),
  observedAt: z.string(),
  period: z.literal("all_time"),
});
export const managedAgentSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  externalUserId: z.string().nullable(),
  ownerAccountId: z.string().nullable(),
  ownerWalletBound: z.boolean(),
  walletProvisioned: z.boolean(),
  policyStatus: policyStateSchema,
});
export const managedAgentPageSchema = pageSchema(managedAgentSchema);
export const managedAgentQuerySchema = z.strictObject({ cursor: idSchema.optional() });

export type WalletView = z.infer<typeof walletViewSchema>;
export type AgentView = z.infer<typeof agentViewSchema>;
export type AgentPage = z.infer<typeof agentPageSchema>;
export type BalanceSource = z.infer<typeof balanceSourceSchema>;
export type BalanceEntry = z.infer<typeof balanceEntrySchema>;
export type BalancesView = z.infer<typeof balancesViewSchema>;
export type TokenView = z.infer<typeof tokenViewSchema>;
export type PolicyView = z.infer<typeof policyViewSchema>;
export type PolicyRevisionView = z.infer<typeof policyRevisionViewSchema>;
export type PolicyHistoryView = z.infer<typeof policyHistoryViewSchema>;
export type LimitsView = z.infer<typeof limitsViewSchema>;
export type GrantView = z.infer<typeof grantViewSchema>;
export type TimelockView = z.infer<typeof timelockViewSchema>;
export type ScheduledExecutionView = z.infer<typeof scheduledExecutionSchema>;
export type ScheduledPage = z.infer<typeof scheduledPageSchema>;
export type BudgetView = z.infer<typeof budgetViewSchema>;
export type ApprovalView = z.infer<typeof approvalViewSchema>;
export type NetworkView = z.infer<typeof networkViewSchema>;
export type WhoamiView = z.infer<typeof whoamiViewSchema>;
export type ContainmentView = z.infer<typeof containmentViewSchema>;
export type DeletionPreview = z.infer<typeof deletionPreviewSchema>;
export type SignatureDelivery = z.infer<typeof signatureDeliverySchema>;
export type DeveloperKey = z.infer<typeof developerKeySchema>;
export type CreatedDeveloperKey = z.infer<typeof createdDeveloperKeySchema>;
export type RevocationView = z.infer<typeof revocationViewSchema>;
export type DeveloperDashboard = z.infer<typeof developerDashboardSchema>;
export type ManagedAgent = z.infer<typeof managedAgentSchema>;
