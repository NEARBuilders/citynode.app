import type {
  AgentAdminCommandMessage,
  AgentControlMessage,
  AgentDeleteMessage,
  AgentGrantMessage,
  BudgetMessage,
  OwnerWallet,
  SigningArtifactOwnerMessage,
  TimelockMessage,
} from "@near-intents-agent-api/contracts";
import type {
  Intent,
  IntentType,
  StatusResponse,
  SubmitIntentRequest,
} from "@near-intents-agent-api/contracts/api";
import { budgetView, grantView, signatureDelivery, timelockView } from "../../api/views.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { deleteAgent } from "../agents/deletion-service.js";
import { issueAgentGrant, revokeAgentGrant } from "../agents/grant-service.js";
import { controlAgent } from "../agents/lifecycle-service.js";
import { submitOnboarding } from "../agents/onboarding-service.js";
import { setBudget } from "../operations/budget-policy-service.js";
import { findOperation } from "../operations/repository.js";
import { operationIdFor } from "../operations/service.js";
import {
  acknowledgeSigningArtifactAsOwner,
  readSigningArtifactAsOwner,
} from "../operations/signing-artifact-owner-service.js";
import { cancelExecution, setTimelock } from "../operations/timelock-policy-service.js";
import { voteApproval } from "../wallet/approval-service.js";
import { submitOwnerPolicy } from "../wallet/owner-policy-submission.js";
import { acceptApprovalVote } from "./approval-recovery.js";
import { commitOwnerIntent } from "./commit-service.js";
import type { ApprovalContext } from "./generate.js";
import {
  approvalVoteSignature,
  assertSamePayload,
  type ConsentContext,
  consentProof,
  type WalletRequestContext,
  walletRequestSubmission,
} from "./payloads.js";
import { findOwnerIntent, type OwnerIntentRecord, updateOwnerIntent } from "./repository.js";
import { intentStatus } from "./status.js";

type Applied = { details: Record<string, unknown>; operationId?: string };
type Handler = (
  actor: Actor,
  row: OwnerIntentRecord,
  signed: SubmitIntentRequest["signedData"],
) => Promise<Applied | undefined>;

const consent = (row: OwnerIntentRecord) => row.context as ConsentContext;
const proofFor = (row: OwnerIntentRecord, signed: SubmitIntentRequest["signedData"]) =>
  consentProof(row.signer as OwnerWallet, consent(row), signed);

/** On-chain requests: relay the signed request; the operation carries the outcome. */
const onboardingHandler: Handler = async (actor, row, signed) => {
  await submitOnboarding(
    actor,
    row.agentId,
    walletRequestSubmission(row.signer, row.context as WalletRequestContext, signed, row.id),
  );
  return undefined;
};

const policyHandler: Handler = async (actor, row, signed) => {
  if (!row.operationId) throw new ApiError("intent_not_found", 404);
  await submitOwnerPolicy(
    actor,
    row.agentId,
    row.operationId,
    walletRequestSubmission(row.signer, row.context as WalletRequestContext, signed, row.id),
  );
  return undefined;
};

const handlers: Record<IntentType, Handler> = {
  agent_create: onboardingHandler,
  policy_update: policyHandler,
  agent_freeze: policyHandler,
  agent_unfreeze: policyHandler,
  grant_issue: async (actor, row, signed) => {
    const grant = await issueAgentGrant(
      actor,
      row.agentId,
      {
        message: consent(row).message as unknown as AgentGrantMessage,
        proof: proofFor(row, signed),
        idempotencyKey: row.id,
      },
      (tx, result) => commitOwnerIntent(tx, actor.tenantId, row.id, { grant: grantView(result) }),
      { signedData: signed, intent: row.intent, context: row.context },
    );
    return { details: { grant: grantView(grant) } };
  },
  grant_revoke: async (actor, row, signed) => {
    const message = consent(row).message as unknown as AgentAdminCommandMessage;
    const revoked = await revokeAgentGrant(
      actor,
      row.agentId,
      message.target_id,
      {
        message: message as Extract<AgentAdminCommandMessage, { action: "revoke_grant" }>,
        proof: proofFor(row, signed),
      },
      (tx, result) =>
        commitOwnerIntent(tx, actor.tenantId, row.id, {
          grantId: message.target_id,
          committedCorrelationIds: result.committed_operation_ids,
          committedTruncated: result.committed_truncated,
        }),
      { signedData: signed, intent: row.intent, context: row.context },
    );
    return {
      details: {
        grantId: message.target_id,
        committedCorrelationIds: revoked.committed_operation_ids,
        committedTruncated: revoked.committed_truncated,
      },
    };
  },
  timelock_set: async (actor, row, signed) => {
    const view = await setTimelock(
      actor,
      row.agentId,
      {
        message: consent(row).message as unknown as TimelockMessage,
        proof: proofFor(row, signed),
      },
      (tx, result) =>
        commitOwnerIntent(tx, actor.tenantId, row.id, { timelock: timelockView(result) }),
      { signedData: signed, intent: row.intent, context: row.context },
    );
    return { details: { timelock: timelockView(view) } };
  },
  budget_set: async (actor, row, signed) => {
    const view = await setBudget(
      actor,
      row.agentId,
      {
        message: consent(row).message as unknown as BudgetMessage,
        proof: proofFor(row, signed),
      },
      (tx, result) => commitOwnerIntent(tx, actor.tenantId, row.id, { budget: budgetView(result) }),
      { signedData: signed, intent: row.intent, context: row.context },
    );
    return { details: { budget: budgetView(view) } };
  },
  execution_cancel: async (actor, row, signed) => {
    const message = consent(row).message as unknown as Extract<
      AgentAdminCommandMessage,
      { action: "cancel_execution" }
    >;
    await cancelExecution(
      actor,
      row.agentId,
      message.target_id,
      {
        message,
        proof: proofFor(row, signed),
      },
      (tx) =>
        commitOwnerIntent(tx, actor.tenantId, row.id, {
          cancelledCorrelationId: message.target_id,
        }),
      { signedData: signed, intent: row.intent, context: row.context },
    );
    return { details: { cancelledCorrelationId: message.target_id } };
  },
  agent_archive: async (actor, row, signed) => {
    const result = await controlAgent(
      actor,
      row.agentId,
      {
        message: consent(row).message as unknown as AgentControlMessage,
        proof: proofFor(row, signed),
      },
      (tx, result) => commitOwnerIntent(tx, actor.tenantId, row.id, { archived: result.archived }),
      { signedData: signed, intent: row.intent, context: row.context },
    );
    return { details: { archived: result.archived } };
  },
  agent_restore: async (actor, row, signed) => {
    const result = await controlAgent(
      actor,
      row.agentId,
      {
        message: consent(row).message as unknown as AgentControlMessage,
        proof: proofFor(row, signed),
      },
      (tx, result) => commitOwnerIntent(tx, actor.tenantId, row.id, { archived: result.archived }),
      { signedData: signed, intent: row.intent, context: row.context },
    );
    return { details: { archived: result.archived } };
  },
  agent_delete: async (actor, row, signed) => {
    try {
      const operation = await deleteAgent(
        actor,
        row.agentId,
        {
          message: consent(row).message as unknown as AgentDeleteMessage,
          proof: proofFor(row, signed),
          idempotencyKey: row.id,
        },
        (tx, operationId) =>
          commitOwnerIntent(tx, actor.tenantId, row.id, null, "submitted", operationId),
      );
      return { details: {}, operationId: operation.id };
    } catch (error) {
      // A deletion reserved before the failure may have reached the provider: the intent must
      // report that operation, not a signable request.
      const operationId = operationIdFor(actor.tenantId, row.agentId, "execute", row.id);
      if (await findOperation(actor.tenantId, row.agentId, operationId))
        await updateOwnerIntent(actor.tenantId, row.id, { state: "submitted", operationId });
      throw error;
    }
  },
  approval_vote: async (actor, row, signed) => {
    const context = row.context as ApprovalContext;
    const signer = row.signer as Extract<OwnerWallet, { type: "near" }>;
    await voteApproval(
      actor,
      row.agentId,
      context.approvalId,
      {
        verdict: context.verdict,
        account_id: signer.accountId,
        public_key: signer.publicKey,
        signature: approvalVoteSignature(signed, signer.publicKey),
        nonce: context.nonceHex,
        request_hash: context.requestHash,
      },
      (tx, evidence) => acceptApprovalVote(tx, row, evidence),
    );
    return { details: { approvalId: context.approvalId, verdict: context.verdict } };
  },
  signing_artifact_read: async (actor, row, signed) => {
    const message = consent(row).message as unknown as SigningArtifactOwnerMessage;
    const delivery = await readSigningArtifactAsOwner(
      actor,
      row.agentId,
      message.operation_id,
      {
        message,
        proof: proofFor(row, signed),
      },
      (tx) => commitOwnerIntent(tx, actor.tenantId, row.id, {}),
    );
    // The signature itself is returned once, in this response; the stored result omits it.
    return { details: { delivery: signatureDelivery(delivery) } };
  },
  signing_artifact_ack: async (actor, row, signed) => {
    const message = consent(row).message as unknown as SigningArtifactOwnerMessage;
    await acknowledgeSigningArtifactAsOwner(
      actor,
      row.agentId,
      message.operation_id,
      {
        message,
        proof: proofFor(row, signed),
      },
      (tx) => commitOwnerIntent(tx, actor.tenantId, row.id, { acknowledged: true }),
    );
    return { details: { acknowledged: true } };
  },
};

/** Types whose outcome lives in an operation created at generate time. */
const operationBacked = new Set<IntentType>([
  "agent_create",
  "policy_update",
  "agent_freeze",
  "agent_unfreeze",
]);

/** Domain refusals that mean an operation-backed intent was already submitted. */
const alreadySubmittedCodes = new Set(["onboarding_not_pending", "policy_not_pending"]);

async function applyHandler(
  actor: Actor,
  row: OwnerIntentRecord,
  input: SubmitIntentRequest,
  submittedOnce: boolean,
): Promise<{ applied: Applied | undefined } | { status: StatusResponse }> {
  try {
    return { applied: await handlers[row.type as IntentType](actor, row, input.signedData) };
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (alreadySubmittedCodes.has(error.code) && submittedOnce)
      return { status: await intentStatus(actor, row, { reconcile: true }) };
    // A concurrent duplicate lost the single-use nonce to the winner; answer with its outcome.
    {
      const current = await findOwnerIntent(actor.tenantId, row.id);
      if (
        current &&
        (current.state === "completed" ||
          current.state === "failed" ||
          (current.state === "submitted" &&
            ["owner_nonce_invalid", "intent_not_pending"].includes(error.code)))
      )
        return { status: await intentStatus(actor, current, { reconcile: false }) };
    }
    throw error;
  }
}

/** Records a synchronously applied intent. A delivered signature is returned, never stored. */
async function completeIntent(actor: Actor, row: OwnerIntentRecord, applied: Applied | undefined) {
  const { delivery, ...stored } = applied?.details ?? {};
  if (row.type === "approval_vote")
    await updateOwnerIntent(
      actor.tenantId,
      row.id,
      { state: "completed", result: stored },
      "submitted",
    );
  const current = (await findOwnerIntent(actor.tenantId, row.id)) ?? row;
  const status = await intentStatus(actor, current, { reconcile: false });
  return delivery ? ({ ...status, details: { delivery } } as StatusResponse) : status;
}

/**
 * Applies the owner's signature to one generated intent. A resubmission after the intent was
 * applied returns its status; a request refused before anything was sent stays signable.
 */
export async function submitIntent(
  actor: Actor,
  input: SubmitIntentRequest,
): Promise<StatusResponse> {
  const row = await findOwnerIntent(actor.tenantId, input.correlationId);
  if (!row) throw new ApiError("intent_not_found", 404);
  if (row.type !== input.type) throw new ApiError("intent_type_mismatch", 409);
  assertSamePayload(row.intent as Intent, input.signedData);

  const type = row.type as IntentType;
  const settled = row.state === "completed" || row.state === "failed";
  const submittedOnce =
    row.state === "submitted" || (type === "agent_delete" && row.operationId !== null);
  if (settled || (submittedOnce && !operationBacked.has(type)))
    return intentStatus(actor, row, { reconcile: true });
  if (row.expiresAt.getTime() <= Date.now() && !submittedOnce)
    throw new ApiError("intent_expired", 409);

  const outcome = await applyHandler(actor, row, input, submittedOnce);
  if ("status" in outcome) return outcome.status;
  const applied = outcome.applied;
  if (!operationBacked.has(type) && !applied?.operationId)
    return completeIntent(actor, row, applied);
  await updateOwnerIntent(actor.tenantId, row.id, {
    state: "submitted",
    ...(applied?.operationId ? { operationId: applied.operationId } : {}),
  });
  const current = (await findOwnerIntent(actor.tenantId, row.id)) ?? row;
  return intentStatus(actor, current, { reconcile: true });
}
