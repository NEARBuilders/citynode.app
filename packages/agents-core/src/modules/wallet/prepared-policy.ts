import {
  evmWalletRequestMessageSchema,
  nearPolicyRequestSchema,
  policyOperationResultSchema,
  walletRequestMessageSchema,
} from "@near-intents-agent-api/contracts";
import { z } from "zod";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { findPolicyOperation } from "../operations/repository.js";
import { finalizePolicyOperation } from "./policy-finalization.js";
import { markPolicyFailed } from "./repository.js";

/**
 * A stored policy preparation: the exact provider transaction its owner signs, persisted in the
 * policy operation's result, and the release of one that can no longer be signed.
 */

const preparedResultMetadataSchema = policyOperationResultSchema
  .pick({
    operation_id: true,
    expected_revision: true,
    transaction_hash: true,
    submitted: true,
    provider_policy_readback: true,
    feePayer: true,
    controller_id: true,
    receiver_id: true,
    gas: true,
  })
  .partial();

export const preparedSchema = z
  .object({
    status: z.enum(["pending_wallet_signature", "dispatching", "submitted", "applied"]),
    policy_id: z.string(),
    wallet_id: z.string(),
    policy_hash: z.string(),
    storage_deposit_yocto: z.string().regex(/^[0-9]+$/),
    wallet_request: z.union([walletRequestMessageSchema, evmWalletRequestMessageSchema]).optional(),
    near_policy_request: nearPolicyRequestSchema.optional(),
  })
  .extend(preparedResultMetadataSchema.shape)
  .extend({
    sponsor_account_id: z.string().optional(),
    sponsor_public_key: z.string().optional(),
    authorization: z.literal("wallet_signature").optional(),
    enforced_by: z.literal("outlayer_contract").optional(),
  });

/** A stored policy preparation, as persisted in the operation result. */
export type PreparedPolicy = z.infer<typeof preparedSchema>;

export async function releaseExpiredPreparation(actor: Actor, agentId: string, policyId: string) {
  const operation = await findPolicyOperation(actor.tenantId, agentId, policyId);
  const prepared = preparedSchema.safeParse(operation?.result);
  const age = operation ? Date.now() - operation.updatedAt.getTime() : Infinity;
  const expiresAt =
    prepared.success && prepared.data.wallet_request
      ? Date.parse(prepared.data.wallet_request.created_at) +
        prepared.data.wallet_request.timeout_secs * 1000
      : operation
        ? operation.updatedAt.getTime() + 600_000
        : 0;
  // A revision without a live operation can never be relayed: a failed operation refuses every
  // later dispatch commitment. Its revision is released instead of blocking the next one.
  if (!operation || operation.status === "failed") {
    await markPolicyFailed(actor.tenantId, agentId, policyId, "preparation_expired");
    return;
  }
  if (operation.status !== "pending" || age < 120_000 || Date.now() < expiresAt)
    throw new ApiError("policy_reconciliation_required", 409);
  await finalizePolicyOperation({
    tenantId: actor.tenantId,
    agentId,
    operationId: operation.id,
    policyId,
    observed: operation,
    outcome: { status: "failed", failureCode: "preparation_expired" },
    result: {
      ...(operation.result as object),
      status: "failed",
      failure_code: "preparation_expired",
    },
  });
}
