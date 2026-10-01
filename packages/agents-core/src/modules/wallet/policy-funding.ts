import { getDatabase } from "../../lib/db.js";
import { ApiError } from "../../shared/errors.js";
import { lockDispatchAuthority, refuseDispatch } from "../operations/dispatch-fence.js";
import { journalPolicyFundingInTransaction } from "../operations/repository.js";
import { type StorageFunding, storedFunding } from "./storage-funding.js";

/**
 * The commitment point of a policy's storage-funding transfer, taken with its exact signed hash
 * immediately before that transfer can broadcast. Funding is an effect of its own: the policy
 * relay that follows takes a separate commitment, so a funded owner never authorizes that relay.
 *
 * Under the dispatch lock order (agent → delayed job → operation, then the operation's sponsor
 * reservation) it re-checks the operation's admission authority and binds the transfer to the
 * claimed revision: its policy id, receiver and deposit. The journal, the permanent budget charge
 * and a `policy.funding_committed` audit event commit together. A revocation that commits first
 * refuses the transfer; one that commits after cannot retract it, and the journal reports it.
 *
 * Only a transfer the stored result does not already account for may commit: an earlier one that
 * succeeded or is still unresolved refuses, and the same hash again is idempotent.
 */
export async function commitPolicyFunding(input: {
  tenantId: string;
  agentId: string;
  operationId: string;
  policyId: string;
  funding: StorageFunding;
  result: Record<string, unknown>;
}): Promise<void> {
  const { tenantId, agentId, operationId, funding } = input;
  await getDatabase().transaction(async (tx) => {
    const authority = await lockDispatchAuthority(tx, tenantId, agentId, operationId);
    if ("refusal" in authority) refuseDispatch(authority.refusal);
    const { operation } = authority;
    const claimed = (operation.result ?? {}) as Record<string, unknown>;
    if (
      operation.kind !== "policy" ||
      operation.status !== "uncertain" ||
      claimed.status !== "dispatching"
    )
      throw new ApiError("operation_not_pending", 409);
    if (
      claimed.policy_id !== input.policyId ||
      claimed.controller_id !== funding.receiver_id ||
      claimed.storage_deposit_yocto !== funding.amount_yocto
    )
      throw new ApiError("storage_funding_mismatch", 409);
    const prior = storedFunding(claimed);
    if (
      prior &&
      prior.status !== "failed" &&
      !(prior.status === "submitted" && prior.transaction_hash === funding.transaction_hash)
    )
      throw new ApiError("storage_funding_unresolved", 409);
    await journalPolicyFundingInTransaction(tx, operation, {
      ...input.result,
      storage_funding: funding,
    });
  });
}
