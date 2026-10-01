import {
  type AgentOnboarding,
  type CreateAgent,
  canonical,
  type OnboardingSignature,
  type OnboardingView,
  type OwnerWallet,
  ownerWalletSchema,
  type Policy,
  policySchema,
} from "@near-intents-agent-api/contracts";
import { z } from "zod";
import { getRuntime } from "../../config/runtime.js";
import type { Actor } from "../../shared/actor.js";
import { hashSecret, newId } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { verifyNearFullAccessKey } from "../../shared/near.js";
import { findOperation, type OperationRecord } from "../operations/repository.js";
import { operationIdFor, runOperation } from "../operations/service.js";
import { stagePolicyRevision } from "../wallet/owner-policy-preparation.js";
import {
  policyFailureCodes,
  providerConfirmsPolicy,
  settlePolicyWrite,
} from "../wallet/owner-policy-reconciliation.js";
import { dispatchPreparedPolicy } from "../wallet/owner-policy-submission.js";
import { finalizePolicyOperation } from "../wallet/policy-finalization.js";
import { assertPolicyWritable } from "../wallet/policy-write-rules.js";
import { preparedSchema } from "../wallet/prepared-policy.js";
import { findPolicyRecord, latestPolicy } from "../wallet/repository.js";
import { provisionWallet, requireActiveWallet } from "../wallet/service.js";
import type { StorageFunding } from "../wallet/storage-funding.js";
import {
  AgentQuotaExceededError,
  abandonAgent,
  abandonAgentInTransaction,
  bindOnboardingOwner,
  insertAgent,
} from "./repository.js";
import { type Agent, agentView, loadAgent, resolveOwnerWallet } from "./service.js";
import { assertOwnerWalletCode, ensureOwnerWalletInitialized } from "./wallet-initialization.js";

/**
 * Agent onboarding: one owner signature creates a live agent.
 *
 * Creation provisions the agent's custody wallet and stages its first policy as the exact
 * on-chain request the proposed owner must sign: a NEP-366 delegate for a named NEAR account, a
 * `w_execute_signed` request for a passkey/EVM `0s` wallet. That request installs the policy for
 * this agent's custody wallet under the owner's account, so its signature is at once the binding
 * proof, the policy consent and the transaction authorization.
 *
 * The owner is written to the agent only after that transaction finalizes and the provider reads
 * the policy back under the owner as controller. Until then the agent is `pending` and every
 * owner-gated route refuses it; an expired or failed request leaves it `abandoned`.
 */

const onboardingIdempotencyKey = "agent-onboarding";
/** NEAR wallets choose the delegate's block horizon; the API bounds how long it will relay. */
const nearOnboardingTtlMs = 10 * 60_000;

const storedOnboardingSchema = preparedSchema.extend({
  status: z.enum(["pending_wallet_signature", "dispatching", "submitted", "applied", "failed"]),
  onboarding: z.literal(true),
  owner: ownerWalletSchema,
  expires_at: z.iso.datetime(),
  failure_code: z.string().optional(),
});
type StoredOnboarding = z.infer<typeof storedOnboardingSchema>;

function onboardingOperationId(tenantId: string, agentId: string) {
  return operationIdFor(tenantId, agentId, "policy", onboardingIdempotencyKey);
}

function signerFor(owner: OwnerWallet) {
  const near = resolveOwnerWallet(owner);
  return {
    near,
    signer: {
      ownerIdentity: owner,
      ownerAccountId: near.accountId,
      ownerPublicKey: near.publicKey,
    },
  };
}

function expiresAt(staged: { wallet_request?: { created_at: string; timeout_secs: number } }) {
  const deadline = staged.wallet_request
    ? Date.parse(staged.wallet_request.created_at) + staged.wallet_request.timeout_secs * 1000
    : Date.now() + nearOnboardingTtlMs;
  return new Date(deadline).toISOString();
}

/** Creates a pending agent with custody and the one request its owner signs to make it live. */
const defaultMaxAgentsPerTenant = 50;

export async function createAgent(
  actor: Actor,
  input: CreateAgent,
  reservedId?: string,
): Promise<AgentOnboarding> {
  const policy = policySchema.parse(input.policy);
  assertPolicyWritable(policy);
  const owner = ownerWalletSchema.parse(input.owner);
  const { near } = signerFor(owner);
  const id = reservedId ?? newId();
  try {
    await insertAgent(
      {
        id,
        tenantId: actor.tenantId,
        name: input.name,
        externalUserId: input.externalUserId ?? null,
      },
      getRuntime().maxAgentsPerTenant ?? defaultMaxAgentsPerTenant,
      getRuntime().maxCreatedAgentsPerTenant,
    );
  } catch (error) {
    if (error instanceof AgentQuotaExceededError) throw new ApiError(error.message, 409);
    throw error;
  }
  try {
    const wallet = await provisionWallet(actor.tenantId, id);
    await runOperation({
      actor,
      agentId: id,
      kind: "policy",
      action: "onboarding",
      idempotencyKey: onboardingIdempotencyKey,
      request: { owner, policy },
      run: async (operationId) => {
        const staged = await stagePolicyRevision({
          tenantId: actor.tenantId,
          agentId: id,
          operationId,
          ownerType: owner.type,
          ownerAccountId: near.accountId,
          wallet,
          policy,
          policyHash: hashSecret(canonical(policy)),
          revision: 0,
          frozenBefore: false,
        });
        return { ...staged, onboarding: true, owner, expires_at: expiresAt(staged) };
      },
    });
  } catch (error) {
    await abandonAgent(actor.tenantId, id, "onboarding_preparation_failed");
    throw error;
  }
  return onboardingResponse(actor, id);
}

/** Current onboarding state. Read only: never touches chain or provider. */
export async function getOnboarding(actor: Actor, id: string): Promise<AgentOnboarding> {
  return onboardingResponse(actor, id);
}

/**
 * Accepts the owner's signature over the prepared request. The signature is verified locally
 * before any sponsor key is used; a passkey/EVM `0s` wallet is initialized only after that proof.
 */
export async function submitOnboarding(
  actor: Actor,
  id: string,
  signed: OnboardingSignature,
): Promise<AgentOnboarding> {
  const { agent, operation, stored } = await onboardingState(actor, id);
  if (
    agent.lifecycle !== "pending" ||
    operation.status !== "pending" ||
    stored.status !== "pending_wallet_signature"
  )
    throw new ApiError("onboarding_not_pending", 409);
  if (Date.parse(stored.expires_at) <= Date.now()) {
    await failOnboarding(actor.tenantId, id, operation, stored, "onboarding_expired");
    throw new ApiError("onboarding_expired", 409);
  }
  const owner = stored.owner;
  const { near, signer } = signerFor(owner);
  await dispatchPreparedPolicy({
    actor,
    agentId: id,
    operationId: operation.id,
    signer,
    prepared: { ...stored, status: "pending_wallet_signature" },
    stored: operation.result,
    signed,
    afterVerify: async () => {
      if (owner.type === "near") await verifyNearFullAccessKey(near.accountId, near.publicKey);
      else await assertOwnerWalletCode(owner);
    },
    afterClaim: async () => {
      if (owner.type !== "near") await ensureOwnerWalletInitialized(owner, near.accountId);
    },
  });
  return reconcileOnboarding(actor, id);
}

/** Observation only: confirms a submitted request, or retires one that can no longer land. */
export async function refreshOnboarding(actor: Actor, id: string): Promise<AgentOnboarding> {
  return reconcileOnboarding(actor, id);
}

async function reconcileOnboarding(actor: Actor, id: string): Promise<AgentOnboarding> {
  const { operation, stored } = await onboardingState(actor, id);
  if (operation.status === "completed" || operation.status === "failed")
    return onboardingResponse(actor, id);
  if (operation.status === "pending") {
    if (Date.parse(stored.expires_at) <= Date.now())
      await failOnboarding(actor.tenantId, id, operation, stored, "onboarding_expired");
    return onboardingResponse(actor, id);
  }
  const settlement = await settlePolicyWrite(stored.owner.type, operation, () =>
    onboardingConfirmed(actor, id, stored),
  );
  if (settlement.settle === "failed")
    // The hash is persisted before broadcast, so a long-claimed request without one never left.
    await failOnboarding(
      actor.tenantId,
      id,
      operation,
      stored,
      settlement.failureCode === policyFailureCodes.not_broadcast
        ? "onboarding_not_broadcast"
        : settlement.failureCode,
      settlement.funding,
    );
  if (settlement.settle === "applied")
    await activateOnboarding(actor, id, operation, stored, settlement.transactionHash);
  return onboardingResponse(actor, id);
}

/** Whether provider readback and the finalized on-chain owner confirm the onboarding policy. */
async function onboardingConfirmed(actor: Actor, id: string, stored: StoredOnboarding) {
  const record = await latestPolicy(actor.tenantId, id);
  if (!record || record.id !== stored.policy_id)
    throw new ApiError("policy_revision_conflict", 409);
  return providerConfirmsPolicy({
    wallet: await requireActiveWallet(actor.tenantId, id),
    expectedOwner: signerFor(stored.owner).near.accountId,
    policy: policySchema.parse(record.rules),
  });
}

/** Binds the owner and activates the agent once provider readback confirmed the final policy. */
async function activateOnboarding(
  actor: Actor,
  id: string,
  operation: OperationRecord,
  stored: StoredOnboarding,
  transactionHash: string,
) {
  const { near } = signerFor(stored.owner);
  // Owner binding, first policy, its epoch and the completed operation commit together.
  await finalizePolicyOperation({
    tenantId: actor.tenantId,
    agentId: id,
    operationId: operation.id,
    policyId: stored.policy_id,
    observed: operation,
    outcome: { status: "applied", transactionHash },
    result: {
      ...(operation.result as object),
      status: "applied",
      transaction_hash: transactionHash,
      provider_policy_readback: true,
    },
    bindOwner: (tx) =>
      bindOnboardingOwner(tx, {
        tenantId: actor.tenantId,
        id,
        ownerAccountId: near.accountId,
        ownerPublicKey: near.publicKey,
        ownerIdentity: stored.owner,
        ownerNear: near,
      }),
  });
}

async function failOnboarding(
  tenantId: string,
  agentId: string,
  operation: OperationRecord,
  stored: StoredOnboarding,
  code: string,
  funding?: StorageFunding,
) {
  await finalizePolicyOperation({
    tenantId,
    agentId,
    operationId: operation.id,
    policyId: stored.policy_id,
    observed: operation,
    outcome: { status: "failed", failureCode: code },
    result: {
      ...(operation.result as object),
      ...(funding ? { storage_funding: funding } : {}),
      status: "failed",
      failure_code: code,
    },
    onFailed: async (tx) => {
      await abandonAgentInTransaction(tx, tenantId, agentId, code);
    },
  });
}

async function onboardingState(actor: Actor, id: string) {
  const agent = await loadAgent(actor, id);
  const operation = await findOperation(
    actor.tenantId,
    id,
    onboardingOperationId(actor.tenantId, id),
  );
  const stored = storedOnboardingSchema.safeParse(operation?.result);
  if (!operation || !stored.success) throw new ApiError("onboarding_not_found", 404);
  return { agent, operation, stored: stored.data };
}

async function onboardingResponse(actor: Actor, id: string): Promise<AgentOnboarding> {
  const { agent, operation, stored } = await onboardingState(actor, id);
  const record = await findPolicyRecord(actor.tenantId, id, stored.policy_id);
  const policy: Policy | null =
    record?.id === stored.policy_id ? policySchema.parse(record.rules) : null;
  if (!policy) throw new ApiError("onboarding_not_found", 404);
  return {
    agent: await agentView(actor, agent),
    onboarding: toOnboardingView(agent, operation, stored, policy),
  };
}

function toOnboardingView(
  agent: Agent,
  operation: OperationRecord,
  stored: StoredOnboarding,
  policy: Policy,
): OnboardingView {
  const signable = stored.status === "pending_wallet_signature" && agent.lifecycle === "pending";
  return {
    operation_id: operation.id,
    status: stored.status,
    owner: stored.owner,
    controller_id: resolveOwnerWallet(stored.owner).accountId,
    wallet_id: stored.wallet_id,
    policy_hash: stored.policy_hash,
    policy,
    expires_at: stored.expires_at,
    transaction_hash: stored.transaction_hash ?? null,
    failure_code: stored.failure_code ?? null,
    ...(signable && stored.near_policy_request
      ? { near_policy_request: stored.near_policy_request }
      : {}),
    ...(signable && stored.wallet_request ? { wallet_request: stored.wallet_request } : {}),
  };
}
