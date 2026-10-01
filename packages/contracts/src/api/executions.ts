import { z } from "zod";
import { nearAccountSchema } from "../common.js";
import { evmChainSchema } from "../operations.js";
import { agentIdSchema, atomicAmountSchema, correlationIdSchema, statusSchema } from "./common.js";
import { intentTypeSchema } from "./intents.js";
import {
  budgetViewSchema,
  grantViewSchema,
  signatureDeliverySchema,
  timelockViewSchema,
} from "./views.js";

/**
 * Agent executions. The agent's own custody wallet signs inside OutLayer under the owner's
 * policy, so no owner signature is needed; the calling API key needs a live owner grant for the
 * action. Field names follow the 1Click quote request. `dry: true` previews without executing.
 */

const asset = z
  .string()
  .min(1)
  .max(256)
  .describe("Asset id from GET /agents/{agentId}/tokens (`assetId`).");

export const swapRequestSchema = z.strictObject({
  originAsset: asset,
  destinationAsset: asset,
  /** Exact input amount, atomic units of `originAsset`. */
  amount: atomicAmountSchema,
  /** Refuse a fill below this output, atomic units of `destinationAsset`. */
  minAmountOut: atomicAmountSchema.optional(),
  /** Settle on the confidential shard. Never falls back to a public route. */
  confidential: z.boolean().default(false),
  /** Quote only: returns the expected output without executing. */
  dry: z.boolean().default(false),
});

export const withdrawRequestSchema = z.strictObject({
  asset,
  amount: atomicAmountSchema,
  /** Destination chain, e.g. `near`, `eth`, `base`, `sol`. */
  chain: z.string().min(1).max(64),
  /** Destination address on `chain`. */
  recipient: z.string().min(1).max(128),
  memo: z.string().max(256).optional(),
  confidential: z.boolean().default(false),
  /** Return as soon as the bridge accepts the request; poll status for settlement. */
  async: z.boolean().default(false),
  /** Preview fees and the received amount without executing. */
  dry: z.boolean().default(false),
});

export const transferRequestSchema = z.strictObject({
  asset,
  amount: atomicAmountSchema,
  /** NEAR Intents account that receives the asset. */
  recipient: nearAccountSchema,
  /** Transfer on the confidential shard instead of public NEAR Intents. */
  confidential: z.boolean().default(false),
});

/** Moves an amount between the agent's own public and confidential balances. */
export const balanceMoveRequestSchema = z.strictObject({
  asset,
  amount: atomicAmountSchema,
});

/** Issues a deposit address that credits the agent's Intents (or confidential) balance. */
export const depositRequestSchema = z
  .strictObject({
    /** Asset sent on the origin chain. Either this or `chain` is required. */
    originAsset: z.string().min(1).max(256).optional(),
    /** Asset credited on NEAR Intents, when it differs from the origin asset. */
    destinationAsset: z.string().min(1).max(256).optional(),
    amount: atomicAmountSchema,
    /** Origin chain, when `originAsset` is not given. */
    chain: z.string().min(1).max(32).optional(),
    asset: z.string().min(1).max(128).optional(),
    /** Origin-chain address that receives a refund. */
    refundTo: z.string().min(1).max(256).optional(),
    confidential: z.boolean().default(false),
  })
  .refine((input) => Boolean(input.originAsset) || Boolean(input.chain), {
    message: "originAsset or chain is required",
    path: ["originAsset"],
  });

export const executionTypeSchema = z.enum([
  "swap",
  "withdraw",
  "transfer",
  "shield",
  "unshield",
  "confidential_deposit",
  "deposit",
]);
export type ExecutionType = z.infer<typeof executionTypeSchema>;

export const recoverRequestSchema = z.strictObject({
  correlationId: correlationIdSchema,
  request: z.discriminatedUnion("type", [
    swapRequestSchema.extend({ type: z.literal("swap") }),
    withdrawRequestSchema.extend({ type: z.literal("withdraw") }),
    transferRequestSchema.extend({ type: z.literal("transfer") }),
    balanceMoveRequestSchema.extend({ type: z.literal("shield") }),
    balanceMoveRequestSchema.extend({ type: z.literal("unshield") }),
    balanceMoveRequestSchema.extend({ type: z.literal("confidential_deposit") }),
  ]),
});

export const signMessageRequestSchema = z.strictObject({
  /** `near` for NEP-413; an EVM chain for EIP-191. */
  chain: z.union([z.literal("near"), evmChainSchema]),
  /** Canonical `near-intents-agent-api.identity.v1` challenge JSON. */
  message: z.string().max(32768),
  encoding: z.enum(["utf8", "hex"]).default("utf8"),
  /** NEP-413 recipient; must equal the challenge audience. Required for `near`. */
  recipient: nearAccountSchema.optional(),
});

export const relayRequestSchema = z.strictObject({
  senderId: z.string().min(2).max(64),
  receiverId: z.string().min(2).max(64),
  publicKey: z.string().startsWith("ed25519:").max(80),
  nonce: z.string().regex(/^(0|[1-9][0-9]{0,19})$/),
  maxBlockHeight: z.string().regex(/^(0|[1-9][0-9]{0,19})$/),
  signatureHex: z.string().regex(/^[0-9a-f]{128}$/),
  actions: z
    .array(
      z.strictObject({
        methodName: z.string().min(1).max(128),
        argsBase64: z
          .string()
          .max(32768)
          .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
        gas: z.string().regex(/^(0|[1-9][0-9]{0,19})$/),
        depositYocto: z.literal("0"),
      }),
    )
    .min(1)
    .max(8),
});

// ---------------------------------------------------------------------------------------------
// Dry-run responses
// ---------------------------------------------------------------------------------------------

export const quoteResponseSchema = z.strictObject({
  dry: z.literal(true),
  type: z.enum(["swap", "withdraw"]),
  /** Provider quote or preview, camelCased. Amounts are atomic strings. */
  quote: z.record(z.string(), z.unknown()),
});
export type QuoteResponse = z.infer<typeof quoteResponseSchema>;

// ---------------------------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------------------------

/** Evidence recorded for an execution. Unknown provider fields pass through camelCased. */
export const executionDetailsSchema = z
  .object({
    action: z.string(),
    nearAccountId: z.string().optional(),
    providerRequestId: z.string().nullable().optional(),
    providerStatus: z.string().optional(),
    confidential: z.boolean().optional(),
    chain: z.string().optional(),
    executeAfter: z.string().optional(),
    delaySeconds: z.number().optional(),
    approvalId: z.string().nullable().optional(),
    intentHash: z.string().nullable().optional(),
    txHash: z.string().nullable().optional(),
    destinationTxHash: z.string().nullable().optional(),
    amountOut: z.string().nullable().optional(),
    depositAddress: z.string().nullable().optional(),
    intentId: z.string().nullable().optional(),
    refundTxHash: z.string().nullable().optional(),
    failureReason: z.string().nullable().optional(),
  })
  .passthrough();

export const statusTypeSchema = z.union([
  intentTypeSchema,
  executionTypeSchema,
  z.enum(["sign_message", "relay"]),
]);
export type StatusType = z.infer<typeof statusTypeSchema>;

const policyDetails = z.strictObject({
  revision: z.number().int().positive().nullable(),
  policyHash: z.string().nullable(),
  transactionHash: z.string().nullable(),
});

export const statusDetailsSchemas = {
  agent_create: policyDetails.extend({ agentId: agentIdSchema }),
  policy_update: policyDetails,
  agent_freeze: policyDetails,
  agent_unfreeze: policyDetails,
  grant_issue: z.strictObject({ grant: grantViewSchema.nullable() }),
  grant_revoke: z.strictObject({
    grantId: z.string().nullable(),
    committedCorrelationIds: z.array(correlationIdSchema).nullable(),
    committedTruncated: z.boolean().nullable(),
  }),
  timelock_set: z.strictObject({ timelock: timelockViewSchema.nullable() }),
  budget_set: z.strictObject({ budget: budgetViewSchema.nullable() }),
  execution_cancel: z.strictObject({ cancelledCorrelationId: correlationIdSchema.nullable() }),
  agent_archive: z.strictObject({ archived: z.boolean().nullable() }),
  agent_restore: z.strictObject({ archived: z.boolean().nullable() }),
  agent_delete: executionDetailsSchema,
  approval_vote: z.strictObject({
    approvalId: z.string().nullable(),
    verdict: z.enum(["approve", "reject"]).nullable(),
  }),
  signing_artifact_read: z.strictObject({
    /** Returned only in the submit-intent response, never by status reads. */
    delivery: signatureDeliverySchema.optional(),
  }),
  signing_artifact_ack: z.strictObject({ acknowledged: z.boolean().nullable() }),
  swap: executionDetailsSchema,
  withdraw: executionDetailsSchema,
  transfer: executionDetailsSchema,
  shield: executionDetailsSchema,
  unshield: executionDetailsSchema,
  confidential_deposit: executionDetailsSchema,
  deposit: executionDetailsSchema,
  sign_message: z.strictObject({ chain: z.string().optional() }).passthrough(),
  relay: z
    .strictObject({
      transactionHash: z.string().nullable().optional(),
    })
    .passthrough(),
} as const satisfies Record<StatusType, z.ZodType>;

const statusBase = {
  correlationId: correlationIdSchema,
  agentId: agentIdSchema.nullable(),
  status: statusSchema,
  /** Kebab-case reason when `status` is `FAILED`, `REFUNDED` or `UNCERTAIN`. */
  failureCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  dispatchCommittedAt: z
    .string()
    .nullable()
    .describe(
      "When the API committed to the provider write, null before that and for owner-signed intents. After it, revoking a key or grant cannot retract the operation.",
    ),
  /** The owner grant that authorized this operation; null for owner-signed work. */
  grant: z.strictObject({ id: z.string(), label: z.string() }).nullable(),
};

export const statusResponseSchema = z.discriminatedUnion(
  "type",
  Object.entries(statusDetailsSchemas).map(([type, details]) =>
    z.strictObject({ ...statusBase, type: z.literal(type), details }),
  ) as unknown as [
    z.ZodObject<{ type: z.ZodLiteral<string> }>,
    ...z.ZodObject<{ type: z.ZodLiteral<string> }>[],
  ],
);

type DetailsOf<T extends StatusType> = z.infer<(typeof statusDetailsSchemas)[T]>;
export type StatusResponseOf<T extends StatusType> = {
  correlationId: string;
  agentId: string | null;
  type: T;
  status: z.infer<typeof statusSchema>;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
  dispatchCommittedAt: string | null;
  grant: { id: string; label: string } | null;
  details: DetailsOf<T>;
};
export type StatusResponse = { [T in StatusType]: StatusResponseOf<T> }[StatusType];
export type ExecutionDetails = z.infer<typeof executionDetailsSchema>;

export const statusQuerySchema = z.strictObject({
  correlationId: correlationIdSchema,
  /** Long-poll up to this many milliseconds for a terminal or signature-needed status. */
  waitMs: z.coerce.number().int().min(0).max(30_000).default(0),
});

export const historyQuerySchema = z.strictObject({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const historyPageSchema = z.strictObject({
  data: z.array(statusResponseSchema),
  nextCursor: z.string().nullable(),
});
export type HistoryPage = { data: StatusResponse[]; nextCursor: string | null };

export type SwapRequest = z.input<typeof swapRequestSchema>;
export type WithdrawRequest = z.input<typeof withdrawRequestSchema>;
export type TransferRequest = z.input<typeof transferRequestSchema>;
export type BalanceMoveRequest = z.input<typeof balanceMoveRequestSchema>;
export type DepositRequest = z.input<typeof depositRequestSchema>;
export type RecoverRequest = z.input<typeof recoverRequestSchema>;
export type SignMessageRequest = z.input<typeof signMessageRequestSchema>;
export type RelayRequest = z.input<typeof relayRequestSchema>;
