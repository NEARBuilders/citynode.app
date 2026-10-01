import {
  type AgentDelete,
  type AgentDeletionChallenge,
  agentDeletionChallengeSchema,
  canonical,
  executionResultSchema,
  policySchema,
} from "@near-intents-agent-api/contracts";
import { getRuntime } from "../../config/runtime.js";
import { getOutlayer } from "../../lib/outlayer.js";
import type { Actor } from "../../shared/actor.js";
import type { CommitEffect } from "../../shared/commit-effect.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { nearAccountExists, nearPolicyOwnerMatches } from "../../shared/near.js";
import { consumeOwnerNonceInTransaction, issueOwnerNonce } from "../../shared/nonces.js";
import {
  ownerEnvelopeMismatch,
  ownerKeyMismatch,
  ownerMessageMaxLifetimeMs,
  ownerMessageWindowInvalid,
} from "../../shared/owner-message.js";
import {
  assertAuthorizationEpochsCurrent,
  commitDispatch,
  type DispatchEpochs,
} from "../operations/dispatch-fence.js";
import { toOperationDto } from "../operations/mapper.js";
import { providerResult, readString } from "../operations/provider-result.js";
import {
  findOperation,
  reservePendingDeletion,
  updateOperationResult,
} from "../operations/repository.js";
import {
  type Operation,
  operationIdFor,
  operationStatusFor,
  readOperation,
  runOperation,
} from "../operations/service.js";
import { balanceList, custodyNativeBalance } from "../wallet/balance-service.js";
import {
  latestAppliedPolicy,
  markCustodyWalletDeletedInTransaction,
} from "../wallet/repository.js";
import { custodyCredential, requireActiveWallet } from "../wallet/service.js";
import { archiveForDeletion, isDeleted } from "./lifecycle-repository.js";
import { verifyBoundOwner } from "./owner-authorization.js";
import { findAgent } from "./repository.js";
import { ownerMessageRecipient, requireBoundAgent } from "./service.js";

type DeletionOperation = NonNullable<Awaited<ReturnType<typeof findOperation>>>;

/**
 * Persist one observed or retried deletion outcome. Marking the custody wallet deleted is
 * conditional on the classified status, so a partial or pending provider answer never retires a
 * wallet that may still hold funds.
 */
async function persistDeletionOutcome(
  actor: Actor,
  agentId: string,
  operationId: string,
  operation: DeletionOperation,
  wallet: Awaited<ReturnType<typeof requireActiveWallet>>,
  result: unknown,
) {
  const status = operationStatusFor(operation.kind, result);
  const persisted = await updateOperationResult(
    actor.tenantId,
    agentId,
    operationId,
    "execute",
    status,
    result,
    status === "completed"
      ? (tx) =>
          markCustodyWalletDeletedInTransaction(
            tx,
            actor.tenantId,
            agentId,
            wallet.providerWalletId,
          )
      : undefined,
  );
  if (!persisted) throw new ApiError("operation_not_found", 404);
  return toOperationDto(actor, persisted);
}

/** The sponsor account that receives a deleted custody account's native NEAR. */
function deletionBeneficiary(): string {
  const beneficiary = getRuntime().sponsorAccountId;
  if (!beneficiary) throw new ApiError("deletion_unavailable", 503);
  return beneficiary;
}

/**
 * Issues the owner's deletion message together with what deletion does to the wallet's funds.
 * Deleting at the provider returns only native NEAR (to the sponsor); public and confidential
 * balances are destroyed. The owner empties the wallet first, for example by asking the agent to
 * withdraw, and signs only once the preview shows nothing left to lose.
 */
export async function deletionChallenge(
  actor: Actor,
  agentId: string,
): Promise<AgentDeletionChallenge> {
  const { agent, wallet } = await requireBoundAgent(actor, agentId);
  const beneficiary = deletionBeneficiary();
  const [native, intents, confidential, allowsDelete, onChain] = await Promise.all([
    custodyNativeBalance(actor, agentId),
    balanceList(actor, agentId, { source: "public" }),
    balanceList(actor, agentId, { source: "confidential" }),
    policyAllowsDelete(actor.tenantId, agentId),
    nearAccountExists(wallet.nearAccountId),
  ]);
  const issuedAtMs = Date.now();
  return agentDeletionChallengeSchema.parse({
    message: {
      domain: "near-intents-agent-api.agent-delete.v3",
      owner: agent.ownerIdentity,
      tenant_id: actor.tenantId,
      agent_id: agentId,
      network: getRuntime().network,
      account_id: agent.ownerAccountId,
      public_key: agent.ownerPublicKey,
      recipient: ownerMessageRecipient(),
      nonce: await issueOwnerNonce(actor.tenantId, agentId),
      issued_at_ms: issuedAtMs,
      expires_at_ms: issuedAtMs + ownerMessageMaxLifetimeMs,
      beneficiary,
      chain: "near",
      confirm_asset_loss: true,
    },
    preview: {
      near_account_id: wallet.nearAccountId,
      beneficiary,
      native_balance: native,
      public: intents.balances,
      confidential: confidential.balances,
      assets_lost: intents.balances.length > 0 || confidential.balances.length > 0,
      retirement: onChain ? "provider_delete" : "credential_erase",
      policy_allows_delete: !onChain || allowsDelete,
    },
  });
}

/**
 * Retires the custody wallet. An account that exists on chain is deleted by OutLayer, which sends
 * its native NEAR to the beneficiary. With no account there is nothing to delete: the result
 * records that the API erases its only credential when the outcome is persisted.
 */
async function retireWallet(
  wallet: Awaited<ReturnType<typeof requireActiveWallet>>,
  target: { beneficiary: string; chain: "near"; onChain: boolean },
  operationId: string,
) {
  const base = {
    action: "delete",
    near_account_id: wallet.nearAccountId,
    beneficiary: target.beneficiary,
    chain: target.chain,
    confirm_asset_loss: true,
  };
  if (!target.onChain)
    return executionResultSchema.parse({
      ...base,
      provider_request_id: null,
      status: "success",
      credential_erased: true,
    });
  const response = await getOutlayer().deleteWallet(
    custodyCredential(wallet),
    { beneficiary: target.beneficiary, chain: target.chain },
    operationId,
  );
  return executionResultSchema.parse({
    ...base,
    provider_request_id: readString(response, "request_id"),
    ...providerResult(response),
  });
}

/** OutLayer refuses `/wallet/v1/delete` unless the applied policy allows the `delete` type. */
async function policyAllowsDelete(tenantId: string, agentId: string): Promise<boolean> {
  const applied = await latestAppliedPolicy(tenantId, agentId);
  if (!applied) return false;
  return policySchema.parse(applied.rules).rules.transaction_types.includes("delete");
}

function assertDeleteMessage(
  actor: Actor,
  agent: Awaited<ReturnType<typeof findAgent>>,
  agentId: string,
  input: AgentDelete,
) {
  const message = input.message;
  if (
    !agent ||
    ownerEnvelopeMismatch(message, actor.tenantId, agentId) ||
    ownerKeyMismatch(message, agent) ||
    message.recipient !== ownerMessageRecipient()
  )
    throw new ApiError("owner_mismatch", 409);
  if (message.beneficiary !== deletionBeneficiary())
    throw new ApiError("delete_beneficiary_invalid", 400);
  if (ownerMessageWindowInvalid(message, Date.now()))
    throw new ApiError("owner_delete_expired", 409);
}

/**
 * Deletes an agent under one owner signature. The agent does not need to be paused or archived
 * first, so it can keep moving funds out until the owner signs. Accepting the deletion archives
 * the agent in the same transaction that reserves the operation: from then on no agent request is
 * admitted, and any request admitted earlier fails its dispatch fence.
 */
export async function deleteAgent(
  actor: Actor,
  agentId: string,
  input: AgentDelete,
  onAccepted?: CommitEffect<string>,
) {
  const agent = await findAgent(actor.tenantId, agentId);
  if (!agent) throw new ApiError("agent_not_found", 404);
  const operationId = operationIdFor(actor.tenantId, agentId, "execute", input.idempotencyKey);
  const requestHash = hashSecret(canonical(input));
  const existing = await findOperation(actor.tenantId, agentId, operationId);
  if (existing) {
    if (existing.requestHash !== requestHash) throw new ApiError("idempotency_conflict", 409);
    return (await toOperationDto(actor, existing)) as Operation;
  }
  if (await isDeleted(actor.tenantId, agentId)) throw new ApiError("agent_deleted", 409);
  const wallet = await requireActiveWallet(actor.tenantId, agentId);
  assertDeleteMessage(actor, agent, agentId, input);
  if (
    !(await nearPolicyOwnerMatches({
      contractId: getOutlayer().contractId,
      nearAccountId: wallet.nearAccountId,
      expectedOwner: agent.ownerAccountId,
    }))
  )
    throw new ApiError("policy_owner_mismatch", 409);
  // With no on-chain account there is nothing for the provider to delete, and nothing its policy
  // governs: the API retires the wallet by erasing its credential. Otherwise OutLayer deletes the
  // account, and it would refuse that under a policy without the `delete` type.
  // An Intents-only wallet is never funded with native NEAR, so its implicit account usually does
  // not exist and OutLayer's `DeleteAccount` cannot run on it.
  const onChain = await nearAccountExists(wallet.nearAccountId);
  if (onChain && !(await policyAllowsDelete(actor.tenantId, agentId)))
    throw new ApiError("policy_blocks_delete", 409);
  const authorizationEpochs: DispatchEpochs = {
    ownerEpoch: agent.ownerEpoch,
    policyEpoch: agent.policyEpoch,
    lifecycleEpoch: agent.lifecycleEpoch,
  };
  await verifyBoundOwner(agent, input.message, input.proof);
  await assertAuthorizationEpochsCurrent(actor.tenantId, agentId, authorizationEpochs);
  const reservation = await reservePendingDeletion({
    id: operationId,
    tenantId: actor.tenantId,
    agentId,
    actorKeyId: actor.keyId,
    requestHash,
    authorize: async (tx) => {
      const archived = await archiveForDeletion(tx, actor.tenantId, agentId, authorizationEpochs, {
        actorKeyId: actor.keyId,
        ownerEpoch: agent.ownerEpoch,
        lifecycleEpoch: agent.lifecycleEpoch,
        requestHash,
      });
      if ("refusal" in archived)
        throw new ApiError(archived.refusal, archived.refusal === "agent_not_found" ? 404 : 409);
      await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, input.message.nonce);
      await onAccepted?.(tx, operationId);
      return archived.epochs;
    },
    initialResult: {
      action: "delete",
      beneficiary: input.message.beneficiary,
      chain: input.message.chain,
      confirm_asset_loss: true,
      near_account_id: wallet.nearAccountId,
      provider_request_id: null,
    },
  });
  if (reservation.kind === "existing") {
    if (reservation.operation.requestHash !== requestHash)
      throw new ApiError("idempotency_conflict", 409);
    return (await toOperationDto(actor, reservation.operation)) as Operation;
  }
  if (reservation.kind === "pending") throw new ApiError("agent_deletion_pending", 409);
  if (reservation.kind === "retired") throw new ApiError("operation_retired", 409);

  return runOperation({
    actor,
    agentId,
    kind: "execute",
    action: "delete",
    idempotencyKey: input.idempotencyKey,
    request: input,
    reserved: true,
    reservedOperationId: operationId,
    onPersist: async (tx, status) => {
      if (status === "completed")
        await markCustodyWalletDeletedInTransaction(
          tx,
          actor.tenantId,
          agentId,
          wallet.providerWalletId,
        );
    },
    run: async (operationIdForProvider) => {
      await commitDispatch(actor.tenantId, agentId, operationIdForProvider);
      return retireWallet(
        wallet,
        { beneficiary: input.message.beneficiary, chain: input.message.chain, onChain },
        operationIdForProvider,
      );
    },
  });
}

/**
 * Deletion observation. It never re-dispatches: a deletion with no provider request id stays
 * uncertain for reconciliation, because a second submission of an irreversible mutation cannot
 * prove the first one had no effect.
 */
export async function refreshDeletion(actor: Actor, agentId: string, operationId: string) {
  const operation = await readOperation(actor, agentId, operationId);
  if (operation?.kind !== "execute") throw new ApiError("operation_not_found", 404);
  const result = operation.result as {
    action?: string;
    beneficiary?: string;
    chain?: "near";
    provider_request_id?: string | null;
  } | null;
  if (result?.action !== "delete") throw new ApiError("operation_kind_mismatch", 409);
  if (!result.beneficiary) throw new ApiError("operation_result_invalid", 409);
  if (operation.status === "completed" || operation.status === "failed")
    return toOperationDto(actor, operation);
  if (!result.provider_request_id) throw new ApiError("delete_submission_uncertain", 409);
  const agent = await findAgent(actor.tenantId, agentId);
  if (!agent) throw new ApiError("agent_not_found", 404);
  const wallet = await requireActiveWallet(actor.tenantId, agentId);
  const response = await getOutlayer().requestStatus(
    custodyCredential(wallet),
    result.provider_request_id,
  );
  if (readString(response, "request_id") !== result.provider_request_id)
    throw new ApiError("provider_request_mismatch", 502);
  const observed = executionResultSchema.parse({
    ...result,
    action: "delete",
    near_account_id: wallet.nearAccountId,
    ...providerResult(response),
  });
  return persistDeletionOutcome(actor, agentId, operationId, operation, wallet, observed);
}
