import "@orpc/openapi/extensions/route";
import type {
  GenerateIntentRequest,
  SubmitIntentRequest,
} from "@near-intents-agent-api/contracts/api";
import {
  acknowledgementSchema,
  agentListQuerySchema,
  agentPageSchema,
  agentViewSchema,
  balanceMoveRequestSchema,
  balanceQuerySchema,
  balancesViewSchema,
  budgetViewSchema,
  depositRequestSchema,
  generateIntentRequestSchema,
  generateIntentResponseSchema,
  grantListViewSchema,
  historyPageSchema,
  historyQuerySchema,
  limitsViewSchema,
  policyHistoryQuerySchema,
  policyHistoryViewSchema,
  policyViewSchema,
  quoteResponseSchema,
  recoverRequestSchema,
  scheduledPageSchema,
  scheduledQuerySchema,
  signatureDeliverySchema,
  signMessageRequestSchema,
  statusResponseSchema,
  submitIntentRequestSchema,
  swapRequestSchema,
  timelockViewSchema,
  tokenListViewSchema,
  transferRequestSchema,
  walletViewSchema,
  withdrawRequestSchema,
} from "@near-intents-agent-api/contracts/api";
import { oc } from "@orpc/contract";
import { UNAUTHORIZED as UnauthorizedError } from "every-plugin/errors";
import { z } from "zod";

const pingInputSchema = z.object({
  message: z.string().optional(),
});

const pingOutputSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
});

const submitIntentOutputSchema = statusResponseSchema;

/** Upstream wire shape + the plugin's replay signal (strict superset). */
const generateIntentOutputSchema = generateIntentResponseSchema.extend({
  replayed: z.boolean(),
});

export const contract = {
  ping: oc
    .route({
      method: "POST",
      path: "/ping",
      summary: "Health check",
    })
    .input(pingInputSchema)
    .output(pingOutputSchema),

  dbHealth: oc
    .route({
      method: "POST",
      path: "/db-health",
      summary: "Database connectivity and migration health",
    })
    .input(z.object({}))
    .output(
      z.object({
        ok: z.boolean(),
        agentCount: z.number(),
      }),
    ),

  generateIntent: oc
    .route({
      method: "POST",
      path: "/generate-intent",
      summary:
        "Build the owner-signed intent for one owner action (agent_create, policy_update, grants, …)",
    })
    .input(generateIntentRequestSchema)
    .output(generateIntentOutputSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  submitIntent: oc
    .route({
      method: "POST",
      path: "/submit-intent",
      summary: "Apply the wallet's signature to a generated intent",
    })
    .input(submitIntentRequestSchema)
    .output(submitIntentOutputSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  intentStatus: oc
    .route({
      method: "POST",
      path: "/status",
      summary: "Status of an intent or execution, long-polling until terminal",
    })
    .input(
      z.object({
        correlationId: z.string(),
        waitMs: z.number().int().min(0).max(30_000).default(0),
      }),
    )
    .output(statusResponseSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  listAgents: oc
    .route({ method: "POST", path: "/agents", summary: "Agents bound to the session's owner" })
    .input(agentListQuerySchema)
    .output(agentPageSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getAgent: oc
    .route({ method: "POST", path: "/agents/get", summary: "One agent's view" })
    .input(z.object({ agentId: z.string() }))
    .output(agentViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getWallet: oc
    .route({ method: "POST", path: "/agents/wallet", summary: "Custody wallet identity" })
    .input(z.object({ agentId: z.string() }))
    .output(walletViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getBalances: oc
    .route({ method: "POST", path: "/agents/balances", summary: "Balances for one agent" })
    .input(balanceQuerySchema.and(z.object({ agentId: z.string() })))
    .output(balancesViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getPolicy: oc
    .route({ method: "POST", path: "/agents/policy", summary: "Current policy state" })
    .input(z.object({ agentId: z.string() }))
    .output(policyViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getPolicyHistory: oc
    .route({ method: "POST", path: "/agents/policy-history", summary: "Policy revision history" })
    .input(policyHistoryQuerySchema.and(z.object({ agentId: z.string() })))
    .output(policyHistoryViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getLimits: oc
    .route({ method: "POST", path: "/agents/limits", summary: "Sponsor and policy limits" })
    .input(z.object({ agentId: z.string() }))
    .output(limitsViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getBudget: oc
    .route({ method: "POST", path: "/agents/budget", summary: "USD budget window" })
    .input(z.object({ agentId: z.string() }))
    .output(budgetViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getTimelock: oc
    .route({ method: "POST", path: "/agents/timelock", summary: "Timelock configuration" })
    .input(z.object({ agentId: z.string() }))
    .output(timelockViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  listScheduledExecutions: oc
    .route({ method: "POST", path: "/agents/scheduled", summary: "Scheduled executions" })
    .input(scheduledQuerySchema.and(z.object({ agentId: z.string() })))
    .output(scheduledPageSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getTokenCatalog: oc
    .route({ method: "POST", path: "/tokens", summary: "Provider token catalog" })
    .input(z.object({}))
    .output(tokenListViewSchema),

  getHistory: oc
    .route({ method: "POST", path: "/agents/history", summary: "Intent and operation history" })
    .input(historyQuerySchema.and(z.object({ agentId: z.string() })))
    .output(historyPageSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  listGrants: oc
    .route({ method: "POST", path: "/agents/grants", summary: "Grants issued for one agent" })
    .input(z.object({ agentId: z.string() }))
    .output(grantListViewSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  swap: oc
    .route({ method: "POST", path: "/agents/swap", summary: "Swap under a grant (dry = quote)" })
    .input(swapRequestSchema.and(z.object({ agentId: z.string() })))
    .output(z.union([quoteResponseSchema, statusResponseSchema]))
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  withdraw: oc
    .route({
      method: "POST",
      path: "/agents/withdraw",
      summary: "Withdraw under a grant (dry = quote)",
    })
    .input(withdrawRequestSchema.and(z.object({ agentId: z.string() })))
    .output(z.union([quoteResponseSchema, statusResponseSchema]))
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  transfer: oc
    .route({ method: "POST", path: "/agents/transfer", summary: "Transfer under a grant" })
    .input(transferRequestSchema.and(z.object({ agentId: z.string() })))
    .output(statusResponseSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  shield: oc
    .route({ method: "POST", path: "/agents/shield", summary: "Shield into confidential balance" })
    .input(balanceMoveRequestSchema.and(z.object({ agentId: z.string() })))
    .output(statusResponseSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  unshield: oc
    .route({
      method: "POST",
      path: "/agents/unshield",
      summary: "Unshield from confidential balance",
    })
    .input(balanceMoveRequestSchema.and(z.object({ agentId: z.string() })))
    .output(statusResponseSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  confidentialDeposit: oc
    .route({
      method: "POST",
      path: "/agents/confidential-deposit",
      summary: "Confidential deposit",
    })
    .input(balanceMoveRequestSchema.and(z.object({ agentId: z.string() })))
    .output(statusResponseSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  deposit: oc
    .route({ method: "POST", path: "/agents/deposit", summary: "Cross-chain deposit" })
    .input(depositRequestSchema.and(z.object({ agentId: z.string() })))
    .output(statusResponseSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  recover: oc
    .route({ method: "POST", path: "/agents/recover", summary: "Recover an interrupted execution" })
    .input(recoverRequestSchema.and(z.object({ agentId: z.string() })))
    .output(statusResponseSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  signMessage: oc
    .route({
      method: "POST",
      path: "/agents/sign-message",
      summary: "Detached signature under a sign-grant (NEP-413 / EIP-191 identity challenge)",
    })
    .input(signMessageRequestSchema.and(z.object({ agentId: z.string() })))
    .output(statusResponseSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  getSignature: oc
    .route({
      method: "POST",
      path: "/agents/signatures",
      summary: "Read a completed signature once, under the grant that authorized it",
    })
    .input(z.object({ agentId: z.string(), correlationId: z.string() }))
    .output(signatureDeliverySchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),

  acknowledgeSignature: oc
    .route({
      method: "POST",
      path: "/agents/signatures/ack",
      summary: "Erase a delivered signature from the server",
    })
    .input(z.object({ agentId: z.string(), correlationId: z.string() }))
    .output(acknowledgementSchema)
    .errors({ UNAUTHORIZED: UnauthorizedError }),
};

export type GenerateIntentInput = GenerateIntentRequest;
export type SubmitIntentInput = SubmitIntentRequest;
export type ContractType = typeof contract;
