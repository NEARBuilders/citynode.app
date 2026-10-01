import {
  canonical,
  type SigningArtifactDelivery,
  type SigningArtifactOwnerAccess,
  type SigningArtifactOwnerAction,
  type SigningArtifactOwnerChallenge,
  signingArtifactOwnerMessageSchema,
} from "@near-intents-agent-api/contracts";
import {
  agentGrants,
  agents,
  auditEvents,
  operationArtifacts,
  operations,
  type Tx,
} from "@near-intents-agent-api/database";
import { createOwnerSigningRequest } from "@near-intents-agent-api/relayer";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getRuntime } from "../../config/runtime.js";
import { getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import type { CommitEffect } from "../../shared/commit-effect.js";
import { ApiError } from "../../shared/errors.js";
import { consumeOwnerNonceInTransaction, issueOwnerNonce } from "../../shared/nonces.js";
import {
  ownerEnvelopeMismatch,
  ownerKeyMismatch,
  ownerMessageMaxLifetimeMs,
  ownerMessageWindowInvalid,
} from "../../shared/owner-message.js";
import { grantRestatesOwnerMessage } from "../agents/grant-integrity.js";
import { ownerPrincipalId } from "../agents/owner-admin-command.js";
import { verifyBoundOwner } from "../agents/owner-authorization.js";
import { ownerMessageRecipient } from "../agents/service.js";
import {
  openSigningArtifact,
  requireSigningArtifactAgentActive,
} from "./signing-artifact-service.js";

const signingActions = new Set([
  "near_message",
  "evm_message",
  "evm_typed_data",
  "evm_transaction",
]);

type OwnerArtifactContext = {
  agent: typeof agents.$inferSelect;
  artifact: typeof operationArtifacts.$inferSelect;
  grant: {
    ownerEpoch: number;
    actions: string[];
    walletId: string;
  };
  operation: { kind: string; status: string; requestHash: string };
};

function notFound(): never {
  throw new ApiError("signing_artifact_not_found", 404);
}

async function ownerArtifactContext(
  tx: Tx,
  actor: Actor,
  agentId: string,
  operationId: string,
): Promise<OwnerArtifactContext> {
  const [agent] = await tx
    .select()
    .from(agents)
    .where(and(eq(agents.tenantId, actor.tenantId), eq(agents.id, agentId)))
    .for("share");
  if (!agent) notFound();
  await requireSigningArtifactAgentActive(tx, actor.tenantId, agentId, agent.lifecycle);

  const [artifact] = await tx
    .select()
    .from(operationArtifacts)
    .where(
      and(
        eq(operationArtifacts.tenantId, actor.tenantId),
        eq(operationArtifacts.agentId, agentId),
        eq(operationArtifacts.operationId, operationId),
      ),
    )
    .for("update");
  if (!artifact || !signingActions.has(artifact.action)) notFound();
  if (artifact.ownerEpoch !== agent.ownerEpoch) notFound();

  const [grant] = await tx
    .select()
    .from(agentGrants)
    .where(
      and(
        eq(agentGrants.tenantId, actor.tenantId),
        eq(agentGrants.agentId, agentId),
        eq(agentGrants.id, artifact.grantId),
      ),
    )
    .for("share");
  const grantOwnerEpoch = grant?.ownerEpoch;
  if (!grant || typeof grantOwnerEpoch !== "number") notFound();
  if (
    grant.ownerEpoch !== artifact.ownerEpoch ||
    !grant.actions.includes(`sign:${artifact.action}`) ||
    !grantRestatesOwnerMessage(grant)
  )
    notFound();

  const [operation] = await tx
    .select({
      kind: operations.kind,
      status: operations.status,
      requestHash: operations.requestHash,
    })
    .from(operations)
    .where(
      and(
        eq(operations.tenantId, actor.tenantId),
        eq(operations.agentId, agentId),
        eq(operations.id, operationId),
      ),
    );
  if (operation?.kind !== "sign" || operation.status !== "completed") notFound();

  const [completedEvent] = await tx
    .select({ requestHash: auditEvents.requestHash })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, actor.tenantId),
        eq(auditEvents.agentId, agentId),
        eq(auditEvents.action, "sign.completed"),
        eq(auditEvents.resourceId, operationId),
        eq(auditEvents.grantId, artifact.grantId),
        eq(auditEvents.ownerEpoch, artifact.ownerEpoch),
      ),
    );
  if (!completedEvent || completedEvent.requestHash !== operation.requestHash) notFound();

  return {
    agent,
    artifact,
    grant: { ...grant, ownerEpoch: grantOwnerEpoch },
    operation,
  };
}

function assertOwnerArtifactMessage(
  actor: Actor,
  agentId: string,
  operationId: string,
  action: SigningArtifactOwnerAction,
  context: OwnerArtifactContext,
  message: SigningArtifactOwnerAccess["message"],
) {
  const { agent, artifact, operation } = context;
  if (
    !agent.ownerIdentity ||
    !agent.ownerAccountId ||
    !agent.ownerPublicKey ||
    ownerEnvelopeMismatch(message, actor.tenantId, agentId) ||
    ownerKeyMismatch(message, agent) ||
    canonical(message.owner) !== canonical(agent.ownerIdentity) ||
    message.recipient !== ownerMessageRecipient() ||
    message.operation_id !== operationId ||
    message.request_hash !== operation.requestHash ||
    message.requesting_key_id !== actor.keyId ||
    message.grant_id !== artifact.grantId ||
    message.owner_epoch !== artifact.ownerEpoch ||
    message.owner_epoch !== agent.ownerEpoch ||
    message.signing_action !== artifact.action ||
    message.action !== action ||
    ownerMessageWindowInvalid(message, Date.now())
  )
    throw new ApiError("signing_artifact_owner_mismatch", 409);
  if (artifact.expiresAt <= new Date() && !(action === "ack" && artifact.consumedAt))
    throw new ApiError("signing_artifact_expired", 410);
}

export async function signingArtifactOwnerChallenge(
  actor: Actor,
  agentId: string,
  operationId: string,
  action: SigningArtifactOwnerAction,
): Promise<SigningArtifactOwnerChallenge> {
  const context = await getDatabase().transaction((tx) =>
    ownerArtifactContext(tx, actor, agentId, operationId),
  );
  const { agent, artifact, operation } = context;
  if (action === "read" && artifact.consumedAt)
    throw new ApiError("signing_artifact_consumed", 410);
  if (artifact.expiresAt <= new Date() && !(action === "ack" && artifact.consumedAt))
    throw new ApiError("signing_artifact_expired", 410);
  if (!agent.ownerIdentity || !agent.ownerAccountId || !agent.ownerPublicKey)
    throw new ApiError("agent_not_bound", 409);
  const issuedAtMs = Date.now();
  const recipient = ownerMessageRecipient();
  const message = signingArtifactOwnerMessageSchema.parse({
    domain: "near-intents-agent-api.signing-artifact-owner.v2",
    owner: agent.ownerIdentity,
    tenant_id: actor.tenantId,
    agent_id: agentId,
    network: getRuntime().network,
    account_id: agent.ownerAccountId,
    public_key: agent.ownerPublicKey,
    recipient,
    nonce: await issueOwnerNonce(actor.tenantId, agentId),
    issued_at_ms: issuedAtMs,
    expires_at_ms: issuedAtMs + ownerMessageMaxLifetimeMs,
    operation_id: operationId,
    request_hash: operation.requestHash,
    requesting_key_id: actor.keyId,
    grant_id: artifact.grantId,
    owner_epoch: artifact.ownerEpoch,
    signing_action: artifact.action,
    action,
  });
  return {
    message,
    signing: createOwnerSigningRequest(message),
    nep413: { message: canonical(message), nonce: message.nonce, recipient: message.recipient },
  };
}

async function verifyOwnerAccess(
  actor: Actor,
  agentId: string,
  operationId: string,
  action: SigningArtifactOwnerAction,
  input: SigningArtifactOwnerAccess,
) {
  const context = await getDatabase().transaction((tx) =>
    ownerArtifactContext(tx, actor, agentId, operationId),
  );
  assertOwnerArtifactMessage(actor, agentId, operationId, action, context, input.message);
  await verifyBoundOwner(context.agent, input.message, input.proof);
}

export async function readSigningArtifactAsOwner(
  actor: Actor,
  agentId: string,
  operationId: string,
  input: SigningArtifactOwnerAccess,
  onCommit?: CommitEffect<SigningArtifactDelivery>,
): Promise<SigningArtifactDelivery> {
  await verifyOwnerAccess(actor, agentId, operationId, "read", input);
  return getDatabase().transaction(async (tx) => {
    const context = await ownerArtifactContext(tx, actor, agentId, operationId);
    assertOwnerArtifactMessage(actor, agentId, operationId, "read", context, input.message);
    if (context.artifact.consumedAt) throw new ApiError("signing_artifact_consumed", 410);
    await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, input.message.nonce);
    await tx.insert(auditEvents).values({
      tenantId: actor.tenantId,
      agentId,
      action: "signing_artifact.owner_read",
      resourceId: operationId,
      actorKeyId: actor.keyId,
      actorOwnerId: ownerPrincipalId(input.message.owner),
      grantId: context.artifact.grantId,
      ownerEpoch: context.artifact.ownerEpoch,
      requestHash: context.operation.requestHash,
    });
    const result = {
      operation_id: operationId,
      artifact: openSigningArtifact(actor, agentId, context.artifact),
      expires_at: context.artifact.expiresAt.toISOString(),
    };
    await onCommit?.(tx, result);
    return result;
  });
}

export async function acknowledgeSigningArtifactAsOwner(
  actor: Actor,
  agentId: string,
  operationId: string,
  input: SigningArtifactOwnerAccess,
  onCommit?: CommitEffect<{ acknowledged: true }>,
) {
  await verifyOwnerAccess(actor, agentId, operationId, "ack", input);
  return getDatabase().transaction(async (tx) => {
    const context = await ownerArtifactContext(tx, actor, agentId, operationId);
    assertOwnerArtifactMessage(actor, agentId, operationId, "ack", context, input.message);
    await consumeOwnerNonceInTransaction(tx, actor.tenantId, agentId, input.message.nonce);
    if (!context.artifact.consumedAt) {
      const cleared = await tx
        .update(operationArtifacts)
        .set({ ciphertext: null, keyId: null, nonce: null, consumedAt: new Date() })
        .where(
          and(
            eq(operationArtifacts.tenantId, actor.tenantId),
            eq(operationArtifacts.agentId, agentId),
            eq(operationArtifacts.operationId, operationId),
            eq(operationArtifacts.grantId, context.artifact.grantId),
            eq(operationArtifacts.ownerEpoch, context.artifact.ownerEpoch),
            eq(operationArtifacts.action, context.artifact.action),
            isNull(operationArtifacts.consumedAt),
            gt(operationArtifacts.expiresAt, sql`now()`),
          ),
        )
        .returning({ operationId: operationArtifacts.operationId });
      if (!cleared.length) throw new ApiError("signing_artifact_expired", 410);
    }
    await tx.insert(auditEvents).values({
      tenantId: actor.tenantId,
      agentId,
      action: "signing_artifact.owner_ack",
      resourceId: operationId,
      actorKeyId: actor.keyId,
      actorOwnerId: ownerPrincipalId(input.message.owner),
      grantId: context.artifact.grantId,
      ownerEpoch: context.artifact.ownerEpoch,
      requestHash: context.operation.requestHash,
    });
    const result = { acknowledged: true as const };
    await onCommit?.(tx, result);
    return result;
  });
}
