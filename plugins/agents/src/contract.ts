import "@orpc/openapi/extensions/route";
import type {
  GenerateIntentRequest,
  SubmitIntentRequest,
} from "@near-intents-agent-api/contracts/api";
import {
  agentListQuerySchema,
  agentPageSchema,
  agentViewSchema,
  balanceQuerySchema,
  balancesViewSchema,
  budgetViewSchema,
  generateIntentRequestSchema,
  grantListViewSchema,
  historyPageSchema,
  historyQuerySchema,
  limitsViewSchema,
  policyHistoryQuerySchema,
  policyHistoryViewSchema,
  policyViewSchema,
  scheduledPageSchema,
  scheduledQuerySchema,
  statusResponseSchema,
  submitIntentRequestSchema,
  timelockViewSchema,
  tokenListViewSchema,
  walletViewSchema,
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

const generateIntentOutputSchema = z.object({
  correlationId: z.string(),
  type: z.string(),
  agentId: z.string(),
  status: z.literal("PENDING_SIGNATURE"),
  expiresAt: z.string(),
  preview: z.unknown(),
  replayed: z.boolean(),
});

const submitIntentOutputSchema = statusResponseSchema;

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
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getAgent: oc
    .route({ method: "POST", path: "/agents/get", summary: "One agent's view" })
    .input(z.object({ agentId: z.string() }))
    .output(agentViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getWallet: oc
    .route({ method: "POST", path: "/agents/wallet", summary: "Custody wallet identity" })
    .input(z.object({ agentId: z.string() }))
    .output(walletViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getBalances: oc
    .route({ method: "POST", path: "/agents/balances", summary: "Balances for one agent" })
    .input(balanceQuerySchema.and(z.object({ agentId: z.string() })))
    .output(balancesViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getPolicy: oc
    .route({ method: "POST", path: "/agents/policy", summary: "Current policy state" })
    .input(z.object({ agentId: z.string() }))
    .output(policyViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getPolicyHistory: oc
    .route({ method: "POST", path: "/agents/policy-history", summary: "Policy revision history" })
    .input(policyHistoryQuerySchema.and(z.object({ agentId: z.string() })))
    .output(policyHistoryViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getLimits: oc
    .route({ method: "POST", path: "/agents/limits", summary: "Sponsor and policy limits" })
    .input(z.object({ agentId: z.string() }))
    .output(limitsViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getBudget: oc
    .route({ method: "POST", path: "/agents/budget", summary: "USD budget window" })
    .input(z.object({ agentId: z.string() }))
    .output(budgetViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getTimelock: oc
    .route({ method: "POST", path: "/agents/timelock", summary: "Timelock configuration" })
    .input(z.object({ agentId: z.string() }))
    .output(timelockViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  listScheduledExecutions: oc
    .route({ method: "POST", path: "/agents/scheduled", summary: "Scheduled executions" })
    .input(scheduledQuerySchema.and(z.object({ agentId: z.string() })))
    .output(scheduledPageSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  getTokenCatalog: oc
    .route({ method: "POST", path: "/tokens", summary: "Provider token catalog" })
    .input(z.object({}))
    .output(tokenListViewSchema),

  getHistory: oc
    .route({ method: "POST", path: "/agents/history", summary: "Intent and operation history" })
    .input(historyQuerySchema.and(z.object({ agentId: z.string() })))
    .output(historyPageSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),

  listGrants: oc
    .route({ method: "POST", path: "/agents/grants", summary: "Grants issued for one agent" })
    .input(z.object({ agentId: z.string() }))
    .output(grantListViewSchema)
    .errors({ UNAUTHORIZED: { message: "Session user required" } }),
};

export type GenerateIntentInput = GenerateIntentRequest;
export type SubmitIntentInput = SubmitIntentRequest;
export type ContractType = typeof contract;
