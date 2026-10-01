import {
  type AgentControlMessage,
  type AgentGrantMessage,
  agentGrantDomain,
  canonical,
  destinationLabel,
  type OwnerWallet,
  policySchema,
} from "@near-intents-agent-api/contracts";
import type {
  GenerateIntentRequest,
  GenerateIntentResponse,
  Intent,
  IntentPreview,
  IntentType,
} from "@near-intents-agent-api/contracts/api";
import { generateIntentRequestSchema } from "@near-intents-agent-api/contracts/api";
import { deletionPreview } from "../../api/views.js";
import { getRuntime } from "../../config/runtime.js";
import { withAdvisoryLock } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { issueOwnerNonce } from "../../shared/nonces.js";
import { ownerMessageMaxLifetimeMs } from "../../shared/owner-message.js";
import { deletionChallenge } from "../agents/deletion-service.js";
import {
  assertGrantMessage,
  grantChallenge,
  grantRevocationChallenge,
} from "../agents/grant-service.js";
import { assertControlTransition } from "../agents/lifecycle-service.js";
import { createAgent } from "../agents/onboarding-service.js";
import { ownerMessageRecipient, requireBoundAgent } from "../agents/service.js";
import { budgetChallenge } from "../operations/budget-policy-service.js";
import { findOperation } from "../operations/repository.js";
import { signingArtifactOwnerChallenge } from "../operations/signing-artifact-owner-service.js";
import { cancellationChallenge, timelockChallenge } from "../operations/timelock-policy-service.js";
import { prepareApproval } from "../wallet/approval-service.js";
import { preparePolicyRevision } from "../wallet/owner-policy-preparation.js";
import { latestAppliedPolicy, latestPolicyVersion } from "../wallet/repository.js";
import { recoverPreparedGeneration } from "./generation-recovery.js";
import { buildReservedDraft, reserveGeneration } from "./generation-service.js";
import {
  approvalVoteIntent,
  type ConsentContext,
  consentIntent,
  type WalletRequestContext,
} from "./payloads.js";
import {
  freezeSummary,
  onboardingDraft,
  policySummary,
  preparedPolicyDraft,
} from "./prepared-drafts.js";
import {
  findOwnerIntent,
  findOwnerIntentByIdempotencyKey,
  insertOwnerIntent,
  type OwnerIntentRecord,
} from "./repository.js";

/** Approval votes carry the approver identity and the provider request they bind. */
export type ApprovalContext = {
  family: "approval";
  approvalId: string;
  verdict: "approve" | "reject";
  requestHash: string;
  nonceHex: string;
};

export type IntentContext = ConsentContext | WalletRequestContext | ApprovalContext;

export type Draft = {
  agentId: string;
  signer: OwnerWallet;
  intent: Intent;
  context: IntentContext;
  preview: IntentPreview;
  expiresAtMs: number;
  operationId?: string;
};

type ParsedRequest = ReturnType<typeof parseRequest>;
type Request<T extends IntentType> = Extract<ParsedRequest, { type: T }>;
type Builder<T extends IntentType> = (
  actor: Actor,
  request: Request<T>,
  correlationId: string,
  reservedAgentId?: string,
) => Promise<Draft>;

function parseRequest(input: GenerateIntentRequest) {
  return generateIntentRequestSchema.parse(input);
}

/** A consent nonce lives five minutes; leave the client a margin to submit inside it. */
const consentLifetimeMs = ownerMessageMaxLifetimeMs - 10_000;

async function boundOwner(actor: Actor, agentId: string) {
  const { agent, wallet } = await requireBoundAgent(actor, agentId);
  if (!agent.ownerIdentity || !agent.ownerAccountId) throw new ApiError("agent_not_bound", 409);
  return { agent, wallet, owner: agent.ownerIdentity, ownerAccountId: agent.ownerAccountId };
}

async function consentDraft(
  actor: Actor,
  agentId: string,
  message: Parameters<typeof consentIntent>[2],
  preview: IntentPreview,
): Promise<Draft> {
  const { owner, ownerAccountId } = await boundOwner(actor, agentId);
  const now = Date.now();
  const built = consentIntent(owner, ownerAccountId, message, now);
  return {
    agentId,
    signer: owner,
    intent: built.intent,
    context: built.context,
    preview,
    expiresAtMs: Math.min(built.expiresAtMs, now + consentLifetimeMs),
  };
}

const agentCreate: Builder<"agent_create"> = async (
  actor,
  request,
  _correlationId,
  reservedAgentId,
) => {
  const created = await createAgent(
    actor,
    {
      name: request.name,
      ...(request.externalUserId === undefined ? {} : { externalUserId: request.externalUserId }),
      owner: request.owner,
      policy: request.policy,
    },
    reservedAgentId,
  );
  return onboardingDraft(request, created);
};

async function policyDraft(
  actor: Actor,
  agentId: string,
  input: { policy: unknown; expectedRevision: number; summary: string },
  correlationId: string,
): Promise<Draft> {
  const { owner } = await boundOwner(actor, agentId);
  const policy = policySchema.parse(input.policy);
  const operation = await preparePolicyRevision(actor, agentId, {
    policy,
    expectedRevision: input.expectedRevision,
    idempotencyKey: `intent:${correlationId}`,
  });
  const stored = await findOperation(actor.tenantId, agentId, operation.id);
  if (!stored) throw new ApiError("policy_not_pending", 409);
  return preparedPolicyDraft(owner, stored, input.summary);
}

const policyUpdate: Builder<"policy_update"> = (actor, request, correlationId) =>
  policyDraft(
    actor,
    request.agentId,
    {
      policy: request.policy,
      expectedRevision: request.expectedRevision,
      summary: policySummary(request.expectedRevision, request.policy.frozen),
    },
    correlationId,
  );

/**
 * Freeze and unfreeze restate the applied rules with the flag changed, as the next revision. The
 * freeze transition itself is derived from the provider's live state during preparation, so a
 * failed or expired earlier revision never decides it.
 */
function freezeBuilder(frozen: boolean): Builder<"agent_freeze" | "agent_unfreeze"> {
  return async (actor, request, correlationId) => {
    const { wallet } = await boundOwner(actor, request.agentId);
    const applied = await latestAppliedPolicy(actor.tenantId, request.agentId);
    if (!applied) throw new ApiError("policy_not_ready", 409);
    return policyDraft(
      actor,
      request.agentId,
      {
        policy: { ...policySchema.parse(applied.rules), frozen },
        expectedRevision: (await latestPolicyVersion(wallet.providerWalletId)) ?? 0,
        summary: freezeSummary(frozen),
      },
      correlationId,
    );
  };
}

const grantIssue: Builder<"grant_issue"> = async (actor, request) => {
  const { agent, wallet, owner } = await boundOwner(actor, request.agentId);
  const challenge = await grantChallenge(actor, request.agentId);
  const issuedAtMs = Date.now();
  const message: AgentGrantMessage = {
    domain: agentGrantDomain,
    owner,
    tenant_id: actor.tenantId,
    agent_id: request.agentId,
    wallet_id: wallet.providerWalletId,
    label: request.label,
    credential: request.credential,
    actions: request.actions,
    recipients: request.recipients ?? [],
    signing_audiences: request.signingAudiences ?? [],
    network: getRuntime().network,
    issued_at_ms: issuedAtMs,
    expires_at_ms: Date.parse(request.expiresAt),
    owner_epoch: challenge.owner_epoch,
    nonce: challenge.nonce,
    recipient: challenge.recipient,
  };
  assertGrantMessage(actor, message, agent, wallet.providerWalletId);
  const recipients = message.recipients.length
    ? message.recipients.map(destinationLabel).join(", ")
    : "internal balances of this agent only";
  return consentDraft(actor, request.agentId, message, {
    summary: `Let "${message.label}" run ${message.actions.join(", ")} (to ${recipients}; signing audiences: ${message.signing_audiences.join(", ") || "none"}) until ${request.expiresAt}.`,
  });
};

const grantRevoke: Builder<"grant_revoke"> = async (actor, request) =>
  consentDraft(
    actor,
    request.agentId,
    await grantRevocationChallenge(actor, request.agentId, request.grantId),
    { summary: `Revoke grant ${request.grantId}.` },
  );

const timelockSet: Builder<"timelock_set"> = async (actor, request) =>
  consentDraft(
    actor,
    request.agentId,
    await timelockChallenge(actor, request.agentId, { delay_seconds: request.delaySeconds }),
    {
      summary: request.delaySeconds
        ? `Delay every execution on this account, by every connection, by ${request.delaySeconds} seconds. Queued executions under the old delay are refused.`
        : "Remove this account's execution delay for every connection. Queued executions under the old delay are refused.",
    },
  );

const budgetSet: Builder<"budget_set"> = async (actor, request) =>
  consentDraft(
    actor,
    request.agentId,
    await budgetChallenge(actor, request.agentId, {
      daily_usd: request.dailyUsd,
      weekly_usd: request.weeklyUsd,
      monthly_usd: request.monthlyUsd,
    }),
    { summary: budgetSummary(request) },
  );

function budgetSummary(request: {
  dailyUsd: string | null;
  weeklyUsd: string | null;
  monthlyUsd: string | null;
}): string {
  const caps = [
    request.dailyUsd && `$${request.dailyUsd} per 24 hours`,
    request.weeklyUsd && `$${request.weeklyUsd} per 7 days`,
    request.monthlyUsd && `$${request.monthlyUsd} per 30 days`,
  ].filter(Boolean);
  return caps.length
    ? `Cap this account's USD spend at ${caps.join(", ")}, across all assets, shared by every connection. Omitted windows are uncapped. Usage already counted stays counted, and usage stays tracked even if caps are later cleared.`
    : "Remove this account's USD caps for every connection. Usage already counted stays counted, and usage stays tracked, so counted executions still need a current price.";
}

const executionCancel: Builder<"execution_cancel"> = async (actor, request) =>
  consentDraft(
    actor,
    request.agentId,
    await cancellationChallenge(actor, request.agentId, request.correlationId),
    { summary: `Cancel queued execution ${request.correlationId}.` },
  );

function controlBuilder(action: "archive" | "restore"): Builder<"agent_archive" | "agent_restore"> {
  return async (actor, request) => {
    const { agent, wallet, owner } = await boundOwner(actor, request.agentId);
    await assertControlTransition(
      actor.tenantId,
      request.agentId,
      action,
      wallet,
      agent.ownerAccountId,
    );
    const issuedAtMs = Date.now();
    const message: AgentControlMessage = {
      domain: "near-intents-agent-api.agent-control.v3",
      tenant_id: actor.tenantId,
      agent_id: request.agentId,
      network: getRuntime().network,
      owner,
      account_id: agent.ownerAccountId as string,
      public_key: agent.ownerPublicKey as string,
      recipient: ownerMessageRecipient(),
      nonce: await issueOwnerNonce(actor.tenantId, request.agentId),
      issued_at_ms: issuedAtMs,
      expires_at_ms: issuedAtMs + ownerMessageMaxLifetimeMs,
      action,
      previous_public_key: agent.ownerPublicKey as string,
    };
    return consentDraft(actor, request.agentId, message, {
      summary:
        action === "archive"
          ? "Archive the agent. It stays frozen and refuses every request until restored."
          : "Restore the archived agent. Unfreeze it with agent_unfreeze to resume executions.",
    });
  };
}

const agentDelete: Builder<"agent_delete"> = async (actor, request) => {
  const challenge = await deletionChallenge(actor, request.agentId);
  if (!challenge.preview.policy_allows_delete) throw new ApiError("policy_blocks_delete", 409);
  const lost = challenge.preview.assets_lost;
  return consentDraft(actor, request.agentId, challenge.message, {
    summary: lost
      ? "Delete the agent. Its remaining public and confidential balances are destroyed; withdraw them first."
      : "Delete the agent and retire its custody wallet. Native NEAR returns to the service sponsor.",
    deletion: deletionPreview(challenge.preview),
  });
};

const approvalVote: Builder<"approval_vote"> = async (actor, request) => {
  const { agent } = await boundOwner(actor, request.agentId);
  const owner = agent.ownerIdentity as OwnerWallet;
  let signer: Extract<OwnerWallet, { type: "near" }>;
  if (request.signer) {
    signer = {
      type: "near",
      accountId: request.signer.accountId,
      publicKey: request.signer.publicKey as `ed25519:${string}`,
    };
  } else {
    // OutLayer accepts NEP-413 votes from NEAR access keys only (open work OW-14).
    if (owner.type !== "near") throw new ApiError("approval_vote_owner_unsupported", 409);
    signer = owner;
  }
  const isOwner =
    signer.accountId === agent.ownerAccountId && signer.publicKey === agent.ownerPublicKey;
  const applied = await latestAppliedPolicy(actor.tenantId, request.agentId);
  const approvers = applied ? policySchema.parse(applied.rules).approval?.approvers : undefined;
  const isApprover = approvers?.some(
    (approver) => approver.id === signer.accountId && approver.pubkey === signer.publicKey,
  );
  if (!isOwner && !isApprover) throw new ApiError("approver_not_allowed", 403);
  const prepared = await prepareApproval(
    actor,
    request.agentId,
    request.approvalId,
    request.verdict,
  );
  return {
    agentId: request.agentId,
    signer,
    intent: approvalVoteIntent({
      message: prepared.message,
      recipient: prepared.recipient,
      nonceHex: prepared.nonce,
    }),
    context: {
      family: "approval",
      approvalId: request.approvalId,
      verdict: request.verdict,
      requestHash: prepared.approval.request_hash,
      nonceHex: prepared.nonce,
    },
    preview: {
      summary: `${request.verdict === "approve" ? "Approve" : "Reject"} the pending ${prepared.approval.request_type} request.`,
      approval: {
        approvalId: request.approvalId,
        requestType: prepared.approval.request_type,
        requestHash: prepared.approval.request_hash,
        verdict: request.verdict,
      },
    },
    expiresAtMs: Math.min(Date.parse(prepared.approval.expires_at), Date.now() + consentLifetimeMs),
  };
};

function artifactBuilder(
  action: "read" | "ack",
): Builder<"signing_artifact_read" | "signing_artifact_ack"> {
  return async (actor, request) => {
    const challenge = await signingArtifactOwnerChallenge(
      actor,
      request.agentId,
      request.correlationId,
      action,
    );
    return consentDraft(actor, request.agentId, challenge.message, {
      summary:
        action === "read"
          ? `Deliver the signature of ${request.correlationId} to this API key.`
          : `Erase the stored signature of ${request.correlationId}.`,
    });
  };
}

const builders: {
  [T in IntentType]: (
    actor: Actor,
    request: Extract<ParsedRequest, { type: T }>,
    correlationId: string,
  ) => Promise<Draft>;
} = {
  agent_create: agentCreate,
  policy_update: policyUpdate,
  agent_freeze: freezeBuilder(true),
  agent_unfreeze: freezeBuilder(false),
  grant_issue: grantIssue,
  grant_revoke: grantRevoke,
  timelock_set: timelockSet,
  budget_set: budgetSet,
  execution_cancel: executionCancel,
  agent_archive: controlBuilder("archive"),
  agent_restore: controlBuilder("restore"),
  agent_delete: agentDelete,
  approval_vote: approvalVote,
  signing_artifact_read: artifactBuilder("read"),
  signing_artifact_ack: artifactBuilder("ack"),
};

export function generateResponse(row: OwnerIntentRecord): GenerateIntentResponse {
  return {
    correlationId: row.id,
    type: row.type as IntentType,
    agentId: row.agentId,
    status: "PENDING_SIGNATURE",
    expiresAt: row.expiresAt.toISOString(),
    signer: row.signer,
    intent: row.intent as Intent,
    preview: row.preview as IntentPreview,
  };
}

/**
 * Builds and stores one owner intent. With an `Idempotency-Key`, a replay of the same request
 * returns the stored intent instead of issuing new nonces or creating another agent.
 */
export async function generateIntent(
  actor: Actor,
  input: GenerateIntentRequest,
  idempotencyKey?: string,
): Promise<{ row: OwnerIntentRecord; replayed: boolean }> {
  const request = parseRequest(input);
  const requestHash = hashSecret(canonical(request));
  const run = async () => {
    if (idempotencyKey) {
      const existing = await findOwnerIntentByIdempotencyKey(actor.tenantId, idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ApiError("idempotency_conflict", 409);
        return { row: existing, replayed: true };
      }
    }
    const generation = await reserveGeneration(actor, request, requestHash, idempotencyKey);
    const correlationId = generation.id;
    const existing = await findOwnerIntent(actor.tenantId, correlationId);
    if (existing) return { row: existing, replayed: true };
    const build = builders[request.type] as Builder<typeof request.type>;
    const draft = await buildReservedDraft<Draft>(
      generation,
      () => build(actor, request as never, correlationId, generation.agentId),
      () => recoverPreparedGeneration(actor, request, generation),
    );
    const replayed = generation.state !== "reserved";
    const row = await insertOwnerIntent({
      id: correlationId,
      tenantId: actor.tenantId,
      agentId: draft.agentId,
      actorKeyId: actor.keyId,
      type: request.type,
      standard: draft.intent.standard,
      signer: draft.signer,
      intent: draft.intent,
      context: draft.context,
      preview: draft.preview,
      operationId: draft.operationId ?? null,
      idempotencyKey: idempotencyKey ?? null,
      requestHash,
      expiresAt: new Date(draft.expiresAtMs),
    });
    return { row, replayed };
  };
  return idempotencyKey
    ? withAdvisoryLock(`intent:${actor.tenantId}:${idempotencyKey}`, run)
    : run();
}
