import {
  type ApprovalVote,
  approvalDetailSchema,
  policySchema,
} from "@near-intents-agent-api/contracts";
import { getDatabase } from "../../lib/db.js";
import { getOutlayer } from "../../lib/outlayer.js";
import type { Actor } from "../../shared/actor.js";
import type { CommitEffect } from "../../shared/commit-effect.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { verifyNearOwnerProof } from "../../shared/near.js";
import { consumeOwnerNonceInTransaction, issueOwnerNonce } from "../../shared/nonces.js";
import { requireActiveAgent } from "../agents/lifecycle-service.js";
import { requireBoundAgent } from "../agents/service.js";
import { latestAppliedPolicy, recordApprovalVote } from "./repository.js";
import { custodyCredential } from "./service.js";

export async function readApproval(actor: Actor, agentId: string, approvalId: string) {
  const { wallet } = await requireBoundAgent(actor, agentId);
  const approval = approvalDetailSchema.parse(
    await getOutlayer().approval(custodyCredential(wallet), approvalId),
  );
  if (approval.id !== approvalId || approval.wallet_id !== wallet.providerWalletId)
    throw new ApiError("approval_not_found", 404);
  return approval;
}

export async function prepareApproval(
  actor: Actor,
  agentId: string,
  approvalId: string,
  verdict: "approve" | "reject",
) {
  const approval = await readApproval(actor, agentId, approvalId);
  if (
    approval.status !== "pending" ||
    !Number.isFinite(Date.parse(approval.expires_at)) ||
    Date.parse(approval.expires_at) <= Date.now()
  )
    throw new ApiError("approval_closed", 409);
  return {
    approval,
    message: `${verdict}:${approval.id}:${approval.wallet_pubkey}:${approval.request_hash}`,
    recipient: getOutlayer().contractId,
    nonce: await issueOwnerNonce(actor.tenantId, agentId),
  };
}

/**
 * Submits one approver's signed vote. The signature is the authority: it binds the verdict to the
 * approval id, the wallet and the exact request hash, and only the owner or an approver listed in
 * the applied policy can produce it. OutLayer verifies the same signature. The API key only
 * carries the vote, so no grant is needed and an agent cannot vote for itself.
 */
export type ApprovalVoteEvidence = {
  walletId: string;
  walletPublicKey: string;
  signatureHash: string;
};

export async function voteApproval(
  actor: Actor,
  agentId: string,
  approvalId: string,
  input: ApprovalVote,
  onAccepted?: CommitEffect<ApprovalVoteEvidence>,
) {
  const { agent, wallet } = await requireBoundAgent(actor, agentId);
  await requireActiveAgent(actor.tenantId, agentId);
  const approval = await readApproval(actor, agentId, approvalId);
  const policy = await latestAppliedPolicy(actor.tenantId, agentId);
  const approvers = policy ? policySchema.parse(policy.rules).approval?.approvers : undefined;
  const isOwner =
    input.account_id === agent.ownerAccountId && input.public_key === agent.ownerPublicKey;
  const isApprover = approvers?.some(
    (approver) => approver.id === input.account_id && approver.pubkey === input.public_key,
  );
  if (!isOwner && !isApprover) throw new ApiError("owner_mismatch", 403);
  if (
    approval.status !== "pending" ||
    !Number.isFinite(Date.parse(approval.expires_at)) ||
    Date.parse(approval.expires_at) <= Date.now()
  )
    throw new ApiError("approval_closed", 409);
  if (approval.request_hash !== input.request_hash) throw new ApiError("approval_changed", 409);
  await verifyNearOwnerProof({
    accountId: input.account_id,
    publicKey: input.public_key,
    message: `${input.verdict}:${approval.id}:${approval.wallet_pubkey}:${approval.request_hash}`,
    recipient: getOutlayer().contractId,
    nonceHex: input.nonce,
    signatureHex: input.signature,
  });
  await getDatabase().transaction(async (tx) => {
    await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, input.nonce);
    await onAccepted?.(tx, {
      walletId: approval.wallet_id,
      walletPublicKey: approval.wallet_pubkey,
      signatureHash: hashSecret(Buffer.from(input.signature, "hex").toString("base64")),
    });
  });
  await recordApprovalVote({
    tenantId: actor.tenantId,
    agentId,
    approvalId,
    actorKeyId: actor.keyId,
    voter: `near:${input.account_id}:${input.public_key}`,
    requestHash: hashSecret(`${approvalId}:${input.verdict}:${input.request_hash}`),
  });
  return getOutlayer().vote(custodyCredential(wallet), approvalId, input.verdict, {
    account_id: input.account_id,
    public_key: input.public_key,
    signature: Buffer.from(input.signature, "hex").toString("base64"),
    nonce: Buffer.from(input.nonce, "hex").toString("base64"),
  });
}
