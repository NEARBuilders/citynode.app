import { z } from "zod";

/**
 * Wire primitives shared by every `/v1` endpoint.
 *
 * The public API follows the NEAR Intents 1Click conventions: camelCase fields, UPPER_SNAKE
 * status values, a `correlationId` on every long-running request, and JSON:API error documents
 * whose stable `code` is kebab-case. Signed protocol objects (policies, owner messages, wallet
 * requests, typed data) keep their own field names because their bytes are signed.
 */

/** Atomic token amount: a non-negative integer in the token's smallest unit. */
export const atomicAmountSchema = z
  .string()
  .regex(/^[0-9]{1,78}$/)
  .describe("Atomic amount in the token's smallest unit, as a decimal integer string.");

export const agentIdSchema = z
  .string()
  .regex(/^[0-9a-f]{64}$/)
  .describe("Agent id.");

/**
 * Every intent or execution is tracked by one correlation id. Owner intents use a UUID;
 * executions, signatures and relays use their 64-hex operation id.
 */
export const correlationIdSchema = z
  .string()
  .regex(/^(?:[0-9a-f]{64}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/)
  .describe("Correlation id returned by generate-intent or an execution endpoint.");

/** Value of the `Idempotency-Key` request header. */
export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

/**
 * Lifecycle of every intent and execution.
 *
 * - `PENDING_SIGNATURE`: generated, waiting for the owner's wallet signature.
 * - `QUEUED`: accepted and waiting for the owner's execution timelock.
 * - `PENDING_APPROVAL`: waiting for approvers configured in the owner's policy.
 * - `PENDING_DEPOSIT`: a deposit address was issued; waiting for funds.
 * - `PROCESSING`: submitted; settlement not yet observed.
 * - `SUCCESS`: settled with evidence.
 * - `REFUNDED`: the route refunded the input.
 * - `FAILED`: provably never executed, or failed with a recorded reason.
 * - `UNCERTAIN`: the outcome is unknown. Keep polling; never resubmit under a new key.
 */
export const statusSchema = z.enum([
  "PENDING_SIGNATURE",
  "QUEUED",
  "PENDING_APPROVAL",
  "PENDING_DEPOSIT",
  "PROCESSING",
  "SUCCESS",
  "REFUNDED",
  "FAILED",
  "UNCERTAIN",
]);
export type Status = z.infer<typeof statusSchema>;

export const terminalStatuses: readonly Status[] = ["SUCCESS", "REFUNDED", "FAILED"];

/** Stable machine-readable error codes are kebab-case. Branch on `code`, never on `title`. */
export const errorCodeSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const apiErrorSchema = z.strictObject({
  status: z.string().regex(/^[1-5][0-9]{2}$/),
  code: errorCodeSchema,
  title: z.string(),
  detail: z.string().optional(),
  source: z.strictObject({ pointer: z.string() }).optional(),
  meta: z.strictObject({ retryable: z.boolean() }).optional(),
});

/** JSON:API error document, as returned by 1Click order endpoints. */
export const errorDocumentSchema = z.strictObject({
  errors: z.array(apiErrorSchema).min(1),
  meta: z.strictObject({ requestId: z.string().optional() }),
});
export type ApiErrorObject = z.infer<typeof apiErrorSchema>;
export type ErrorDocument = z.infer<typeof errorDocumentSchema>;

/** Converts an internal snake_case failure code to its public kebab-case form. */
export function publicCode(code: string): string {
  return code.replaceAll("_", "-").toLowerCase();
}

/** Cursor page shape used by every list endpoint. */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
