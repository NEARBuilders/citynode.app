import {
  evmSignatureSchema,
  grantTokenPattern,
  type SigningArtifactDelivery,
  signatureSchema,
} from "@near-intents-agent-api/contracts";
import {
  agentGrants,
  agents,
  apiKeys,
  auditEvents,
  operationArtifacts,
  operations,
  type Tx,
  walletPolicies,
} from "@near-intents-agent-api/database";
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { databaseClock, getDatabase } from "../../lib/db.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { openSecret } from "../../shared/secrets.js";
import { grantRestatesOwnerMessage } from "../agents/grant-integrity.js";
import { grantCredentialHash } from "../agents/grant-service.js";

const signingArtifactSchema = signatureSchema.or(evmSignatureSchema);
const signingActions = new Set([
  "near_message",
  "evm_message",
  "evm_typed_data",
  "evm_transaction",
]);
type ArtifactFamily = "signing";
type ArtifactRow = typeof operationArtifacts.$inferSelect;

function familyOf(action: string): ArtifactFamily | undefined {
  if (signingActions.has(action)) return "signing";
  return undefined;
}

function artifactError(_family: ArtifactFamily, suffix: string) {
  return new ApiError(
    `signing_artifact_${suffix}`,
    suffix === "not_found" ? 404 : suffix === "unavailable" ? 503 : 410,
  );
}

async function authorizedArtifact(
  tx: Tx,
  actor: Actor,
  agentId: string,
  operationId: string,
  family: ArtifactFamily,
  grantToken: string | undefined,
): Promise<{ artifact: ArtifactRow; consumed: boolean; decidedAt: Date }> {
  const [agent] = await tx
    .select({ ownerEpoch: agents.ownerEpoch, lifecycle: agents.lifecycle })
    .from(agents)
    .where(and(eq(agents.tenantId, actor.tenantId), eq(agents.id, agentId)))
    .for("share");
  if (!agent) throw new ApiError("agent_not_found", 404);
  // Delivery is its own revocation-ordered decision: key revocation waits for this share lock, and
  // a revocation that committed first excludes the key even though the request authenticated.
  const [key] = await tx
    .select({ expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.tenantId, actor.tenantId),
        eq(apiKeys.id, actor.keyId),
        isNull(apiKeys.revokedAt),
      ),
    )
    .for("share");
  if (!key) throw artifactError(family, "not_found");
  await requirePrivilegedArtifactDeliveryAllowed(
    tx,
    actor.tenantId,
    agentId,
    family,
    agent.lifecycle,
  );
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
  if (!artifact || familyOf(artifact.action) !== family) throw artifactError(family, "not_found");
  const grant = await requireLiveArtifactGrant(
    tx,
    actor,
    agentId,
    artifact,
    agent.ownerEpoch,
    family,
    grantToken,
  );
  await requireCompletedArtifactOperation(tx, actor, agentId, artifact, family);
  await requireArtifactAudit(tx, actor, agentId, artifact, family);
  const decidedAt = await databaseClock(tx);
  if (key.expiresAt <= decidedAt || grant.expiresAt <= decidedAt)
    throw artifactError(family, "not_found");
  return { artifact, consumed: artifact.consumedAt !== null, decidedAt };
}

/**
 * A privileged artifact is unavailable once archive or a confirmed/pending freeze is authoritative.
 * Pending signed freeze rows are deliberately fail-closed: provider freeze can succeed before
 * policy readback commits, and a failed DB confirmation must not make stored artifacts readable.
 */
export async function requirePrivilegedArtifactDeliveryAllowed(
  tx: Tx,
  tenantId: string,
  agentId: string,
  family: ArtifactFamily,
  lifecycle?: string,
) {
  let currentLifecycle = lifecycle;
  if (currentLifecycle === undefined) {
    const [agent] = await tx
      .select({ lifecycle: agents.lifecycle })
      .from(agents)
      .where(and(eq(agents.tenantId, tenantId), eq(agents.id, agentId)))
      .for("share");
    currentLifecycle = agent?.lifecycle;
  }
  if (currentLifecycle !== "active") throw artifactError(family, "not_found");

  const [applied] = await tx
    .select({ version: walletPolicies.version, rules: walletPolicies.rules })
    .from(walletPolicies)
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        eq(walletPolicies.status, "applied"),
      ),
    )
    .orderBy(desc(walletPolicies.version))
    .limit(1);
  const appliedFrozen =
    applied?.rules !== null &&
    typeof applied?.rules === "object" &&
    (applied.rules as { frozen?: unknown }).frozen === true;
  if (appliedFrozen) throw artifactError(family, "not_found");

  const [pendingFreeze] = await tx
    .select({ version: walletPolicies.version })
    .from(walletPolicies)
    .where(
      and(
        eq(walletPolicies.tenantId, tenantId),
        eq(walletPolicies.agentId, agentId),
        eq(walletPolicies.status, "signed"),
        applied ? gt(walletPolicies.version, applied.version) : undefined,
        sql`${walletPolicies.rules}->>'frozen' = 'true'`,
      ),
    )
    .limit(1);
  if (pendingFreeze) throw artifactError(family, "not_found");
}

export function requireSigningArtifactAgentActive(
  tx: Tx,
  tenantId: string,
  agentId: string,
  lifecycle?: string,
) {
  return requirePrivilegedArtifactDeliveryAllowed(tx, tenantId, agentId, "signing", lifecycle);
}

async function requireLiveArtifactGrant(
  tx: Tx,
  actor: Actor,
  agentId: string,
  artifact: ArtifactRow,
  currentOwnerEpoch: number,
  family: ArtifactFamily,
  grantToken: string | undefined,
) {
  // Only the token of the grant that authorized the signature can collect it.
  if (!grantToken || !grantTokenPattern.test(grantToken)) throw artifactError(family, "not_found");
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
  const grantAction = `sign:${artifact.action}`;
  if (
    !grant ||
    grant.credentialHash !== grantCredentialHash(grantToken) ||
    grant.ownerEpoch !== artifact.ownerEpoch ||
    grant.ownerEpoch !== currentOwnerEpoch ||
    grant.revokedAt !== null ||
    !grant.actions.includes(grantAction) ||
    !grantRestatesOwnerMessage(grant)
  )
    throw artifactError(family, "not_found");
  return grant;
}

async function requireCompletedArtifactOperation(
  tx: Tx,
  actor: Actor,
  agentId: string,
  artifact: ArtifactRow,
  family: ArtifactFamily,
) {
  const [operation] = await tx
    .select({ kind: operations.kind, status: operations.status })
    .from(operations)
    .where(
      and(
        eq(operations.tenantId, actor.tenantId),
        eq(operations.agentId, agentId),
        eq(operations.id, artifact.operationId),
      ),
    );
  if (operation?.kind !== "sign" || operation?.status !== "completed")
    throw artifactError(family, "not_found");
}

async function requireArtifactAudit(
  tx: Tx,
  actor: Actor,
  agentId: string,
  artifact: ArtifactRow,
  _family: ArtifactFamily,
) {
  return requireSigningArtifactAudit(tx, actor, agentId, artifact);
}

async function requireSigningArtifactAudit(
  tx: Tx,
  actor: Actor,
  agentId: string,
  artifact: ArtifactRow,
) {
  const [event] = await tx
    .select({ operationId: auditEvents.resourceId })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, actor.tenantId),
        eq(auditEvents.agentId, agentId),
        eq(auditEvents.action, "sign.completed"),
        eq(auditEvents.resourceId, artifact.operationId),
        eq(auditEvents.grantId, artifact.grantId),
        eq(auditEvents.ownerEpoch, artifact.ownerEpoch),
      ),
    );
  if (!event) throw artifactError("signing", "not_found");
}

function openArtifact<T>(
  actor: Actor,
  agentId: string,
  artifact: ArtifactRow,
  family: ArtifactFamily,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
): T {
  if (!artifact.ciphertext || !artifact.keyId || !artifact.nonce)
    throw artifactError(family, "consumed");
  try {
    const plaintext = openSecret(
      { ciphertext: artifact.ciphertext, keyId: artifact.keyId, nonce: artifact.nonce },
      {
        schemaVersion: 1,
        tenantId: actor.tenantId,
        agentId,
        walletId: "",
        purpose: "operation_signing_artifact",
        operationId: artifact.operationId,
        grantId: artifact.grantId,
        ownerEpoch: artifact.ownerEpoch,
        signingAction: artifact.action,
      },
    );
    const parsed = schema.safeParse(JSON.parse(plaintext));
    if (!parsed.success) throw new Error("invalid operation artifact payload");
    return parsed.data;
  } catch {
    throw artifactError(family, "unavailable");
  }
}

export function openSigningArtifact(actor: Actor, agentId: string, artifact: ArtifactRow) {
  return openArtifact(actor, agentId, artifact, "signing", signingArtifactSchema);
}

export async function readSigningArtifact(
  actor: Actor,
  agentId: string,
  operationId: string,
  grantToken: string | undefined,
): Promise<SigningArtifactDelivery> {
  const family = "signing";
  return getDatabase().transaction(async (tx) => {
    const { artifact, consumed, decidedAt } = await authorizedArtifact(
      tx,
      actor,
      agentId,
      operationId,
      family,
      grantToken,
    );
    if (consumed) throw artifactError(family, "consumed");
    if (artifact.expiresAt <= decidedAt) throw artifactError(family, "expired");
    return {
      operation_id: operationId,
      artifact: openArtifact(actor, agentId, artifact, family, signingArtifactSchema),
      expires_at: artifact.expiresAt.toISOString(),
    };
  });
}

async function acknowledgeArtifact(
  actor: Actor,
  agentId: string,
  operationId: string,
  family: ArtifactFamily,
  grantToken: string | undefined,
) {
  return getDatabase().transaction(async (tx) => {
    const { artifact, consumed, decidedAt } = await authorizedArtifact(
      tx,
      actor,
      agentId,
      operationId,
      family,
      grantToken,
    );
    if (consumed) return { acknowledged: true as const };
    if (artifact.expiresAt <= decidedAt) throw artifactError(family, "expired");
    const cleared = await tx
      .update(operationArtifacts)
      .set({ ciphertext: null, keyId: null, nonce: null, consumedAt: new Date() })
      .where(
        and(
          eq(operationArtifacts.tenantId, actor.tenantId),
          eq(operationArtifacts.agentId, agentId),
          eq(operationArtifacts.operationId, operationId),
          eq(operationArtifacts.grantId, artifact.grantId),
          isNull(operationArtifacts.consumedAt),
          gt(operationArtifacts.expiresAt, sql`now()`),
        ),
      )
      .returning({ operationId: operationArtifacts.operationId });
    if (!cleared.length) throw artifactError(family, "expired");
    return { acknowledged: true as const };
  });
}

export function acknowledgeSigningArtifact(
  actor: Actor,
  agentId: string,
  operationId: string,
  grantToken: string | undefined,
) {
  return acknowledgeArtifact(actor, agentId, operationId, "signing", grantToken);
}

const artifactCleanupBatchSize = 500;

export async function sweepExpiredOperationArtifacts() {
  const rows = await getDatabase().transaction(async (tx) => {
    const expired = await tx
      .select({
        tenantId: operationArtifacts.tenantId,
        agentId: operationArtifacts.agentId,
        operationId: operationArtifacts.operationId,
      })
      .from(operationArtifacts)
      .where(lte(operationArtifacts.expiresAt, sql`now()`))
      .orderBy(asc(operationArtifacts.expiresAt))
      .limit(artifactCleanupBatchSize)
      .for("update", { skipLocked: true });
    if (!expired.length) return [];
    const predicate = or(
      ...expired.map(({ tenantId, agentId, operationId }) =>
        and(
          eq(operationArtifacts.tenantId, tenantId),
          eq(operationArtifacts.agentId, agentId),
          eq(operationArtifacts.operationId, operationId),
        ),
      ),
    );
    if (!predicate) return [];
    return tx
      .delete(operationArtifacts)
      .where(predicate)
      .returning({ operationId: operationArtifacts.operationId });
  });
  return { removed: rows.length };
}
