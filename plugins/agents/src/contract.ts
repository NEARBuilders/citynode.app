import "@orpc/openapi/extensions/route";
import type {
  GenerateIntentRequest,
  SubmitIntentRequest,
} from "@near-intents-agent-api/contracts/api";
import {
  generateIntentRequestSchema,
  statusResponseSchema,
  submitIntentRequestSchema,
} from "@near-intents-agent-api/contracts/api";
import { oc } from "@orpc/contract";
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
    .errors({
      UNAUTHORIZED: { message: "Session user required" },
    }),

  submitIntent: oc
    .route({
      method: "POST",
      path: "/submit-intent",
      summary: "Apply the wallet's signature to a generated intent",
    })
    .input(submitIntentRequestSchema)
    .output(submitIntentOutputSchema)
    .errors({
      UNAUTHORIZED: { message: "Session user required" },
    }),

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
    .errors({
      UNAUTHORIZED: { message: "Session user required" },
    }),
};

export type GenerateIntentInput = GenerateIntentRequest;
export type SubmitIntentInput = SubmitIntentRequest;
export type ContractType = typeof contract;
