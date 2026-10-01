import "@orpc/openapi/extensions/route";
import { oc } from "@orpc/contract";
import { z } from "zod";

const pingInputSchema = z.object({
  message: z.string().optional(),
});

const pingOutputSchema = z.object({
  message: z.string(),
  timestamp: z.string(),
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
};

export type ContractType = typeof contract;
