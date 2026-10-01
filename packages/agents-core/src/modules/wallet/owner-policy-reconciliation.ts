import { type OwnerWallet, type Policy, policySchema } from "@near-intents-agent-api/contracts";
import { getOutlayer } from "../../lib/outlayer.js";
import { getOwnerPolicySponsor } from "../../lib/owner-policy-sponsor.js";
import { getWalletSponsor } from "../../lib/wallet-sponsor.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { invalidatePolicyOwnerCache, nearPolicyOwnerMatches } from "../../shared/near.js";
import { requireBoundAgent } from "../agents/service.js";
import { findOperation, findPolicyOperation } from "../operations/repository.js";
import { finalizePolicyOperation } from "./policy-finalization.js";
import { matchesProviderPolicy } from "./policy-readiness.js";
import {
  type PreparedPolicy,
  preparedSchema,
  releaseExpiredPreparation,
} from "./prepared-policy.js";
import { type CustodyWalletRecord, latestPolicy } from "./repository.js";
import { custodyCredential } from "./service.js";
import { type StorageFunding, storedFunding } from "./storage-funding.js";

/**
 * Policy reconciliation: observation only.
 *
 * Nothing here broadcasts. A finalized transaction is confirmed against provider readback and the
 * on-chain owner before the revision is marked applied, so `applied` always means the provider
 * agrees rather than that a transaction hash was returned. Unresolved evidence remains unresolved regardless of age.
 */

async function reconcilePendingPolicy(
  actor: Actor,
  agentId: string,
  operationId: string,
  operation: NonNullable<Awaited<ReturnType<typeof findOperation>>>,
  prepared: PreparedPolicy,
) {
  if (!prepared.policy_id) return operation;
  try {
    await releaseExpiredPreparation(actor, agentId, prepared.policy_id);
  } catch (error) {
    if (error instanceof ApiError && error.code === "policy_reconciliation_required")
      return operation;
    throw error;
  }
  return (await findOperation(actor.tenantId, agentId, operationId)) ?? operation;
}

/**
 * A claimed revision persists its relay hash before broadcast, so one still without a hash this
 * long after its last write never broadcast its policy transaction. Storage funding is a separate
 * transfer journaled before its own broadcast; see `unrelayedPolicyOutcome`.
 */
export const unbroadcastClaimTtlMs = 10 * 60_000;

/** Absence is evidence only after a broadcast had time to reach every endpoint. */
const droppedProofDelayMs = 2 * 60_000;
/** Non-archival RPC nodes keep at least five epochs (about 2.5 days); stay well inside that. */
const droppedProofWindowMs = 24 * 60 * 60_000;

/**
 * Provider caches can trail a final transaction. A succeeded write whose readback still differs
 * this long after its broadcast was persisted is judged on that readback.
 */
export const readbackGraceMs = 10 * 60_000;

type SponsorTransaction = {
  transaction_hash?: string;
  sponsor_account_id?: string;
  sponsor_public_key?: string;
  sponsor_nonce?: string;
};

/**
 * Chain status of one sponsor transaction; unreachable RPC reads as still pending.
 *
 * `dropped` needs the sponsor nonce persisted at broadcast and an operation young enough that a
 * transaction that did execute would still be retrievable.
 */
async function sponsorTransactionStatus(
  ownerType: OwnerWallet["type"] | undefined,
  transaction: SponsorTransaction,
  updatedAt: Date,
) {
  if (!transaction.transaction_hash) return "pending" as const;
  const sponsor = ownerType === "near" ? getOwnerPolicySponsor() : getWalletSponsor()?.relaySigned;
  if (!sponsor) return "pending" as const;
  const age = Date.now() - updatedAt.getTime();
  const witness =
    transaction.sponsor_public_key &&
    transaction.sponsor_nonce &&
    age >= droppedProofDelayMs &&
    age <= droppedProofWindowMs
      ? { publicKey: transaction.sponsor_public_key, nonce: BigInt(transaction.sponsor_nonce) }
      : undefined;
  try {
    return await sponsor.status(
      transaction.transaction_hash,
      transaction.sponsor_account_id,
      witness,
    );
  } catch {
    return "pending" as const;
  }
}

/** Chain status of a relayed policy transaction. */
export function policyTransactionStatus(
  ownerType: OwnerWallet["type"] | undefined,
  operation: { result: unknown; updatedAt: Date },
) {
  return sponsorTransactionStatus(
    ownerType,
    (operation.result ?? {}) as SponsorTransaction,
    operation.updatedAt,
  );
}

/**
 * A claimed revision with no relay hash. Its storage funding, if any was journaled, is settled on
 * chain first: while that transfer's outcome is unknown the operation stays uncertain, whatever
 * the relay did. Once it is settled, the relay that never left is `not_broadcast` after the claim
 * TTL, and the settled funding travels with the failure so it is never mistaken for no effect.
 */
export async function unrelayedPolicyOutcome(
  ownerType: OwnerWallet["type"] | undefined,
  operation: { result: unknown; updatedAt: Date },
): Promise<{ outcome: "pending" } | { outcome: "not_broadcast"; funding?: StorageFunding }> {
  let funding = storedFunding(operation.result);
  if (funding?.status === "submitted") {
    const status = await sponsorTransactionStatus(ownerType, funding, operation.updatedAt);
    // Unavailable or incomplete evidence never proves funding settled.
    if (status === "pending") return { outcome: "pending" };
    funding = { ...funding, status: status === "succeeded" ? "succeeded" : "failed" };
  }
  if (Date.now() - operation.updatedAt.getTime() <= unbroadcastClaimTtlMs)
    return { outcome: "pending" };
  return { outcome: "not_broadcast", funding };
}

/**
 * Applied means both the finalized on-chain policy owner and the provider's decrypted readback
 * match the signed revision, after dropping every cache that could answer with the old policy.
 */
export async function providerConfirmsPolicy(input: {
  wallet: CustodyWalletRecord;
  expectedOwner: string | null;
  policy: Policy;
}) {
  const outlayer = getOutlayer();
  invalidatePolicyOwnerCache(outlayer.contractId, input.wallet.nearAccountId);
  const credential = custodyCredential(input.wallet);
  await outlayer.invalidatePolicyCache(credential, { walletId: input.wallet.providerWalletId });
  const provider = await outlayer.policy(credential);
  return (
    (await nearPolicyOwnerMatches({
      contractId: outlayer.contractId,
      nearAccountId: input.wallet.nearAccountId,
      expectedOwner: input.expectedOwner,
    })) && matchesProviderPolicy(provider, input.wallet.providerWalletId, input.policy)
  );
}

/**
 * The claimed revision's outcome: the relay's chain status when it has a hash, otherwise whatever
 * its journaled funding and the claim TTL prove. Unknown relay outcomes remain pending.
 */
export async function policyWriteOutcome(
  ownerType: OwnerWallet["type"] | undefined,
  operation: { result: unknown; updatedAt: Date },
) {
  const transactionHash = (operation.result as { transaction_hash?: string } | null)
    ?.transaction_hash;
  if (!transactionHash) return unrelayedPolicyOutcome(ownerType, operation);
  const outcome = await policyTransactionStatus(ownerType, operation);
  return { outcome, funding: undefined };
}

export const policyFailureCodes = {
  failed: "policy_transaction_failed",
  dropped: "policy_transaction_dropped",
  not_broadcast: "policy_not_broadcast",
  /** The relay succeeded, but what the provider holds is not the signed revision. */
  mismatch: "policy_readback_mismatch",
} as const;

export type PolicySettlement =
  | { settle: "wait" }
  | { settle: "applied"; transactionHash: string }
  | {
      settle: "failed";
      failureCode: string;
      funding?: StorageFunding;
      /** The relay may have changed provider state, so work admitted before it must be fenced. */
      providerChanged: boolean;
    };

/**
 * How a claimed revision settles, from facts alone:
 *
 * - A relay that failed, was dropped or never left fails; nothing it signed took effect.
 * - A relay that succeeded is applied once readback confirms the signed revision. If readback
 *   still differs after the grace period, what landed is not that revision: it fails, and the
 *   caller fences work admitted before it, since provider state may have changed.
 * - An unavailable or incomplete chain result remains unresolved, at any age.
 *
 * `confirm` reads the provider back; it runs only once the transaction can no longer change.
 * The owner corrects a failed revision by signing a new one, prepared from the provider's state.
 */
export async function settlePolicyWrite(
  ownerType: OwnerWallet["type"] | undefined,
  operation: { result: unknown; updatedAt: Date },
  confirm: () => Promise<boolean>,
): Promise<PolicySettlement> {
  const write = await policyWriteOutcome(ownerType, operation);
  if (write.outcome === "pending") return { settle: "wait" };
  if (write.outcome !== "succeeded")
    return {
      settle: "failed",
      failureCode: policyFailureCodes[write.outcome],
      funding: write.funding,
      providerChanged: false,
    };
  const transactionHash = (operation.result as { transaction_hash: string }).transaction_hash;
  if (await confirm()) return { settle: "applied", transactionHash };
  if (Date.now() - operation.updatedAt.getTime() < readbackGraceMs) return { settle: "wait" };
  return {
    settle: "failed",
    failureCode: policyFailureCodes.mismatch,
    providerChanged: true,
  };
}

/**
 * Settles the revision a new preparation would replace when its outcome is already decided, before
 * that preparation is admitted: an applied predecessor advances the policy epoch, which would
 * otherwise make the new admission stale. One still undecided is left for the preparation to
 * refuse with `policy_reconciliation_required`.
 */
export async function settleSupersededRevision(actor: Actor, agentId: string) {
  const previous = await latestPolicy(actor.tenantId, agentId);
  if (previous?.status !== "signed") return;
  const operation = await findPolicyOperation(actor.tenantId, agentId, previous.id);
  if (operation?.status === "uncertain") await reconcileOwnerPolicy(actor, agentId, operation.id);
}

/** Read only: provider and finalized onchain owner must both match signed revision. */
export async function reconcileOwnerPolicy(actor: Actor, agentId: string, operationId: string) {
  const { agent, wallet } = await requireBoundAgent(actor, agentId);
  const operation = await findOperation(actor.tenantId, agentId, operationId);
  if (operation?.kind !== "policy") throw new ApiError("operation_not_found", 404);
  if (operation.status === "completed" || operation.status === "failed") return operation;
  const prepared = preparedSchema.safeParse(operation?.result);
  if (!prepared.success) throw new ApiError("operation_not_found", 404);
  if (operation.status === "pending")
    return reconcilePendingPolicy(actor, agentId, operationId, operation, prepared.data);
  const settlement = await settlePolicyWrite(agent.ownerIdentity?.type, operation, () =>
    confirmedApplication(actor, agent.ownerAccountId, wallet, operation),
  );
  if (settlement.settle === "wait") return operation;
  const settle = {
    tenantId: actor.tenantId,
    agentId,
    operationId,
    policyId: prepared.data.policy_id,
    observed: operation,
  };
  const finalized =
    settlement.settle === "applied"
      ? await finalizePolicyOperation({
          ...settle,
          outcome: { status: "applied", transactionHash: settlement.transactionHash },
          result: {
            ...(operation.result as object),
            ...prepared.data,
            status: "applied",
            transaction_hash: settlement.transactionHash,
            provider_policy_readback: true,
          },
        })
      : await finalizePolicyOperation({
          ...settle,
          outcome: {
            status: "failed",
            failureCode: settlement.failureCode,
            advanceEpoch: settlement.providerChanged,
          },
          result: {
            ...(operation.result as object),
            ...(settlement.funding ? { storage_funding: settlement.funding } : {}),
            status: "failed",
            failure_code: settlement.failureCode,
          },
        });
  return finalized ?? (await findOperation(actor.tenantId, agentId, operationId)) ?? operation;
}

/** Whether the provider and on-chain owner both confirm the claimed revision. */
async function confirmedApplication(
  actor: Actor,
  ownerAccountId: string | null,
  wallet: CustodyWalletRecord,
  operation: { agentId: string; result: unknown },
) {
  const result = operation.result as { policy_id: string };
  const record = await latestPolicy(actor.tenantId, operation.agentId);
  if (!record || record.id !== result.policy_id)
    throw new ApiError("policy_revision_conflict", 409);
  return providerConfirmsPolicy({
    wallet,
    expectedOwner: ownerAccountId,
    policy: policySchema.parse(record.rules),
  });
}
