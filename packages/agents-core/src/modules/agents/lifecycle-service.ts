import { type AgentControl, canonical } from "@near-intents-agent-api/contracts";
import { getOutlayer } from "../../lib/outlayer.js";
import type { Actor } from "../../shared/actor.js";
import type { CommitEffect } from "../../shared/commit-effect.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { nearPolicyOwnerMatches } from "../../shared/near.js";
import { consumeOwnerNonceInTransaction } from "../../shared/nonces.js";
import { ownerEnvelopeMismatch, ownerMessageWindowInvalid } from "../../shared/owner-message.js";
import { assertOwnerIdentity } from "../../shared/owner-proof.js";
import { custodyCredential } from "../wallet/service.js";
import { applyControl, isArchived, isDeleted } from "./lifecycle-repository.js";
import { verifyBoundOwner } from "./owner-authorization.js";
import { recordOwnerReceipt } from "./owner-receipts.js";
import { ownerMessageRecipient, requireBoundAgent, resolveOwnerWallet } from "./service.js";

export async function requireActiveAgent(tenantId: string, agentId: string) {
  if (await isDeleted(tenantId, agentId)) throw new ApiError("agent_deleted", 409);
  if (await isArchived(tenantId, agentId)) throw new ApiError("agent_archived", 409);
}

function assertControlMessage(
  actor: Actor,
  agentId: string,
  agent: Awaited<ReturnType<typeof requireBoundAgent>>["agent"],
  message: AgentControl["message"],
) {
  if (
    ownerEnvelopeMismatch(message, actor.tenantId, agentId) ||
    message.account_id !== agent.ownerAccountId ||
    message.previous_public_key !== agent.ownerPublicKey ||
    message.recipient !== ownerMessageRecipient()
  )
    throw new ApiError("owner_mismatch", 409);
  if (message.public_key !== agent.ownerPublicKey) throw new ApiError("owner_mismatch", 409);
  if (ownerMessageWindowInvalid(message, Date.now()))
    throw new ApiError("owner_control_expired", 409);
}

export async function assertControlTransition(
  tenantId: string,
  agentId: string,
  action: AgentControl["message"]["action"],
  wallet: Awaited<ReturnType<typeof requireBoundAgent>>["wallet"],
  ownerAccountId: string | null,
) {
  const archived = await isArchived(tenantId, agentId);
  if (action === "archive" && archived) throw new ApiError("agent_archived", 409);
  if (action === "restore" && !archived) throw new ApiError("agent_not_archived", 409);
  const provider = await getOutlayer().policy(custodyCredential(wallet));
  const expectedFrozen = action === "archive";
  if (
    !(await nearPolicyOwnerMatches({
      contractId: getOutlayer().contractId,
      nearAccountId: wallet.nearAccountId,
      expectedOwner: ownerAccountId,
    })) ||
    provider.frozen !== expectedFrozen
  )
    throw new ApiError(
      action === "archive" ? "pause_before_archive" : "unpause_before_restore",
      409,
    );
}

export async function controlAgent(
  actor: Actor,
  agentId: string,
  input: AgentControl,
  onCommit?: CommitEffect<{ archived: boolean; ownerPublicKey: string }>,
  original?: unknown,
) {
  const { agent, wallet } = await requireBoundAgent(actor, agentId);
  const message = input.message;
  assertControlMessage(actor, agentId, agent, message);
  assertOwnerIdentity(agent.ownerIdentity, message.owner);
  const near = resolveOwnerWallet(message.owner);
  if (message.account_id !== near.accountId || message.public_key !== near.publicKey)
    throw new ApiError("owner_mismatch", 409);
  const verification = await verifyBoundOwner(agent, message, input.proof);
  await assertControlTransition(
    actor.tenantId,
    agentId,
    message.action,
    wallet,
    agent.ownerAccountId,
  );
  const result = { archived: message.action === "archive", ownerPublicKey: message.public_key };
  const applied = await applyControl(
    actor.tenantId,
    agentId,
    agent.ownerAccountId ?? "",
    message.previous_public_key,
    message.action,
    agent.ownerCounter,
    {
      actorKeyId: actor.keyId,
      ownerEpoch: agent.ownerEpoch,
      lifecycleEpoch: agent.lifecycleEpoch,
      requestHash: hashSecret(canonical(message)),
    },
    async (tx) => {
      await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, message.nonce);
      await recordOwnerReceipt(tx, {
        tenantId: actor.tenantId,
        agentId,
        action: `agent_${message.action}`,
        targetId: agentId,
        ownerEpoch: agent.ownerEpoch,
        message,
        proof: input.proof,
        verification,
        original,
      });
      await onCommit?.(tx, result);
    },
  );
  if (!applied) throw new ApiError("owner_mismatch", 409);
  return result;
}
