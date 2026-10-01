import {
  evmSignatureSchema,
  type SigningArtifactAction,
  signatureSchema,
} from "@near-intents-agent-api/contracts";
import {
  auditEvents,
  delayedExecutions,
  operationArtifacts,
  operations,
  operationTombstones,
  sponsorReservations,
  type Tx,
} from "@near-intents-agent-api/database";
import { and, desc, eq, inArray, isNotNull, isNull, lt, notExists, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import { sealSecret } from "../../shared/secrets.js";
import { type AuditProvenance, auditProvenance } from "../agents/repository.js";
import { type DispatchEpochs, lockDispatchAuthority } from "./dispatch-fence.js";
import { redactOperationResult } from "./result-projection.js";
import type { OperationKind } from "./schema.js";
import { requireSigningArtifactAgentActive } from "./signing-artifact-service.js";

export const operationArtifactTtlMs = 15 * 60 * 1000;

export type SigningArtifactPersistence = {
  grantId: string;
  ownerEpoch: number;
  action: SigningArtifactAction;
};

export type OperationStatus = "pending" | "completed" | "uncertain" | "failed";
export type OperationRecord = {
  id: string;
  tenantId: string;
  agentId: string;
  actorKeyId: string | null;
  kind: OperationKind;
  action: string | null;
  requestHash: string;
  status: OperationStatus;
  result: unknown;
  authorizedOwnerEpoch: number | null;
  authorizedPolicyEpoch: number | null;
  authorizedLifecycleEpoch: number | null;
  authorizedGrantId: string | null;
  authorizedGrantLabel: string | null;
  dispatchClaimedAt: Date | null;
  dispatchCommittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function createPendingOperation(input: {
  id: string;
  tenantId: string;
  agentId: string;
  actorKeyId?: string | null;
  grant?: { id: string; label: string };
  kind: OperationKind;
  action?: string;
  requestHash: string;
  authorizationEpochs?: DispatchEpochs;
  delayed?: {
    delaySeconds: number;
    nearAccountId: string;
    action: string;
    request: unknown;
    grantId: string;
    ownerEpoch: number;
  };
}): Promise<Array<{ id: string }>> {
  const { authorizationEpochs, grant, delayed, ...operation } = input;
  const authorizedGrantId = grant?.id ?? null;
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Admission, tombstone and delayed payload must commit in one transaction.
  return getDatabase().transaction(async (tx) => {
    const [admitted] = await tx
      .insert(operationTombstones)
      .values({
        tenantId: input.tenantId,
        agentId: input.agentId,
        id: input.id,
        requestHash: input.requestHash,
      })
      .onConflictDoNothing()
      .returning({ id: operationTombstones.id });
    if (!admitted) return [];
    const inserted = await tx
      .insert(operations)
      .values({
        ...operation,
        action: input.action ?? null,
        actorKeyId: input.actorKeyId ?? null,
        status: "pending",
        authorizedOwnerEpoch: authorizationEpochs?.ownerEpoch ?? null,
        authorizedPolicyEpoch: authorizationEpochs?.policyEpoch ?? null,
        authorizedLifecycleEpoch: authorizationEpochs?.lifecycleEpoch ?? null,
        authorizedGrantId,
        authorizedGrantLabel: grant?.label ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: operations.id });
    if (inserted.length)
      await tx.insert(auditEvents).values({
        tenantId: input.tenantId,
        agentId: input.agentId,
        resourceId: input.id,
        action: `${input.kind}.pending`,
        actorKeyId: input.actorKeyId ?? null,
        grantId: authorizedGrantId,
        requestHash: input.requestHash,
        ...authorizationEpochs,
      });
    if (inserted.length && delayed) {
      const sealed = sealSecret(JSON.stringify(delayed.request), {
        schemaVersion: 1,
        tenantId: input.tenantId,
        agentId: input.agentId,
        walletId: "",
        purpose: "delayed_execution",
        operationId: input.id,
        grantId: delayed.grantId,
        ownerEpoch: delayed.ownerEpoch,
      });
      const [job] = await tx
        .insert(delayedExecutions)
        .values({
          tenantId: input.tenantId,
          agentId: input.agentId,
          id: input.id,
          grantId: delayed.grantId,
          ownerEpoch: delayed.ownerEpoch,
          ...sealed,
          executeAfter: sql`now() + ${delayed.delaySeconds} * interval '1 second'`,
        })
        .returning({ executeAfter: delayedExecutions.executeAfter });
      if (!job) throw new Error("timelock_insert_failed");
      await tx
        .update(operations)
        .set({
          result: {
            status: "timelocked",
            near_account_id: delayed.nearAccountId,
            provider_request_id: null,
            action: delayed.action,
            execute_after: job.executeAfter.toISOString(),
            delay_seconds: delayed.delaySeconds,
          },
        })
        .where(
          and(
            eq(operations.tenantId, input.tenantId),
            eq(operations.agentId, input.agentId),
            eq(operations.id, input.id),
          ),
        );
    }
    return inserted;
  });
}

export async function findOperation(
  tenantId: string,
  agentId: string,
  id: string,
): Promise<OperationRecord | undefined> {
  return (
    await getDatabase()
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.tenantId, tenantId),
          eq(operations.agentId, agentId),
          eq(operations.id, id),
        ),
      )
  )[0];
}

/** Resolves a correlation id within a tenant, without knowing its agent. */
export async function findTenantOperation(
  tenantId: string,
  id: string,
): Promise<OperationRecord | undefined> {
  return (
    await getDatabase()
      .select()
      .from(operations)
      .where(and(eq(operations.tenantId, tenantId), eq(operations.id, id)))
      .limit(1)
  )[0];
}

/** The policy operation that produced a wallet_policies row, if one was reserved. */
export async function findPolicyOperation(
  tenantId: string,
  agentId: string,
  policyId: string,
): Promise<OperationRecord | undefined> {
  return (
    await getDatabase()
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.tenantId, tenantId),
          eq(operations.agentId, agentId),
          eq(operations.kind, "policy"),
          sql`${operations.result}->>'policy_id' = ${policyId}`,
        ),
      )
      .orderBy(desc(operations.updatedAt))
      .limit(1)
  )[0];
}

export async function reservePendingDeletion(input: {
  id: string;
  tenantId: string;
  agentId: string;
  actorKeyId?: string | null;
  requestHash: string;
  initialResult: unknown;
  /** Runs after every refusal check and returns the epochs the deletion commits under. */
  authorize: (tx: Tx) => Promise<DispatchEpochs>;
}) {
  return getDatabase().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(1935764847)`);
    const [same] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.tenantId, input.tenantId),
          eq(operations.agentId, input.agentId),
          eq(operations.id, input.id),
        ),
      );
    if (same) return { kind: "existing" as const, operation: same };
    const [retired] = await tx
      .select({ id: operationTombstones.id })
      .from(operationTombstones)
      .where(
        and(
          eq(operationTombstones.tenantId, input.tenantId),
          eq(operationTombstones.agentId, input.agentId),
          eq(operationTombstones.id, input.id),
        ),
      );
    if (retired) return { kind: "retired" as const };
    const [pending] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.tenantId, input.tenantId),
          eq(operations.agentId, input.agentId),
          eq(operations.kind, "execute"),
          inArray(operations.status, ["pending", "uncertain"]),
          sql`${operations.result}->>'action' = 'delete'`,
        ),
      )
      .limit(1);
    if (pending) return { kind: "pending" as const, operation: pending };
    const epochs = await input.authorize(tx);
    await tx.insert(operationTombstones).values({
      tenantId: input.tenantId,
      agentId: input.agentId,
      id: input.id,
      requestHash: input.requestHash,
    });
    const [created] = await tx
      .insert(operations)
      .values({
        id: input.id,
        tenantId: input.tenantId,
        agentId: input.agentId,
        actorKeyId: input.actorKeyId ?? null,
        kind: "execute",
        action: "delete",
        requestHash: input.requestHash,
        status: "pending",
        authorizedOwnerEpoch: epochs.ownerEpoch,
        authorizedPolicyEpoch: epochs.policyEpoch,
        authorizedLifecycleEpoch: epochs.lifecycleEpoch,
        result: redactOperationResult(input.initialResult, "execute"),
      })
      .returning();
    if (!created) throw new Error("deletion_reservation_failed");
    return { kind: "created" as const, operation: created };
  });
}

type PreparedOperationArtifact = {
  grantId: string;
  ownerEpoch: number;
  action: string;
  sealed: ReturnType<typeof sealSecret>;
};

function prepareSigningArtifact(
  tenantId: string,
  agentId: string,
  id: string,
  kind: OperationKind,
  status: OperationStatus,
  result: unknown,
  provenance: AuditProvenance | undefined,
  artifact: SigningArtifactPersistence,
): PreparedOperationArtifact {
  if (kind !== "sign" || status !== "completed") throw new Error("signing_artifact_status_invalid");
  if (artifact.grantId !== provenance?.grantId || !Number.isSafeInteger(artifact.ownerEpoch))
    throw new Error("signing_artifact_provenance_mismatch");
  const schema = artifact.action === "near_message" ? signatureSchema : evmSignatureSchema;
  const parsed = schema.safeParse(result);
  if (!parsed.success) throw new Error("signing_artifact_invalid");
  return {
    grantId: artifact.grantId,
    ownerEpoch: artifact.ownerEpoch,
    action: artifact.action,
    sealed: sealSecret(JSON.stringify(parsed.data), {
      schemaVersion: 1,
      tenantId,
      agentId,
      walletId: "",
      purpose: "operation_signing_artifact",
      operationId: id,
      grantId: artifact.grantId,
      ownerEpoch: artifact.ownerEpoch,
      signingAction: artifact.action,
    }),
  };
}

function prepareOperationArtifact(input: {
  tenantId: string;
  agentId: string;
  id: string;
  kind: OperationKind;
  status: OperationStatus;
  result: unknown;
  provenance?: AuditProvenance;
  signingArtifact?: SigningArtifactPersistence;
}): PreparedOperationArtifact | undefined {
  const { signingArtifact } = input;
  if (signingArtifact)
    return prepareSigningArtifact(
      input.tenantId,
      input.agentId,
      input.id,
      input.kind,
      input.status,
      input.result,
      input.provenance,
      signingArtifact,
    );
  if (input.kind === "sign" && input.status === "completed")
    throw new Error("signing_artifact_provenance_required");
  return undefined;
}

async function insertOperationArtifact(
  tx: Tx,
  tenantId: string,
  agentId: string,
  id: string,
  artifact: PreparedOperationArtifact,
) {
  await requireSigningArtifactAgentActive(tx, tenantId, agentId);
  await tx.insert(operationArtifacts).values({
    tenantId,
    agentId,
    operationId: id,
    grantId: artifact.grantId,
    ownerEpoch: artifact.ownerEpoch,
    action: artifact.action,
    ...artifact.sealed,
    expiresAt: new Date(Date.now() + operationArtifactTtlMs),
  });
}

export async function persistOperationResult(
  tenantId: string,
  agentId: string,
  id: string,
  kind: OperationKind,
  status: OperationStatus,
  result: unknown,
  provenance?: AuditProvenance,
  signingArtifact?: SigningArtifactPersistence,
  onPersist?: (tx: Tx) => Promise<void>,
): Promise<OperationRecord> {
  const persistedResult = persistedOperationResult(result, kind, status);
  const artifact = prepareOperationArtifact({
    tenantId,
    agentId,
    id,
    kind,
    status,
    result,
    provenance,
    signingArtifact,
  });

  return getDatabase().transaction(async (tx) => {
    const current = await lockOperation(tx, tenantId, agentId, id);
    if (!current) throw new Error("operation_not_found");
    // A terminal outcome is final; a late or stale writer neither downgrades nor finalizes it.
    if (current.status === "completed" || current.status === "failed") return current;
    const [persisted] = await tx
      .update(operations)
      .set({
        status,
        result: mergeOperationEvidence(current.result, persistedResult),
        updatedAt: sql`clock_timestamp()`,
      })
      .where(operationIdentity(tenantId, agentId, id))
      .returning();
    if (!persisted) throw new Error("operation_not_found");
    if (artifact) await insertOperationArtifact(tx, tenantId, agentId, id, artifact);
    if (onPersist) await onPersist(tx);
    await tx.insert(auditEvents).values({
      tenantId,
      agentId,
      action: `${kind}.${status}`,
      resourceId: id,
      ...auditProvenance(provenance),
    });
    return persisted;
  });
}

/**
 * Journals a committed storage-funding transfer inside the caller's transaction, which already
 * holds the operation's dispatch lock and has validated it. The sponsor reservation becomes a
 * permanent charge in the same write: a transfer that may broadcast is real spend.
 */
export async function journalPolicyFundingInTransaction(
  tx: Tx,
  operation: OperationRecord,
  result: unknown,
) {
  const { tenantId, agentId, id } = operation;
  await tx
    .update(operations)
    .set({
      result: mergeOperationEvidence(
        operation.result,
        persistedOperationResult(result, "policy", "uncertain"),
      ),
      updatedAt: sql`clock_timestamp()`,
    })
    .where(operationIdentity(tenantId, agentId, id));
  await tx
    .update(sponsorReservations)
    .set({ state: "committed" })
    .where(and(eq(sponsorReservations.operationId, id), eq(sponsorReservations.state, "reserved")));
  await tx.insert(auditEvents).values({
    tenantId,
    agentId,
    action: "policy.funding_committed",
    resourceId: id,
    actorKeyId: operation.actorKeyId,
    ownerEpoch: operation.authorizedOwnerEpoch,
    policyEpoch: operation.authorizedPolicyEpoch,
    lifecycleEpoch: operation.authorizedLifecycleEpoch,
    requestHash: operation.requestHash,
  });
}

/** Row-locks one operation in the caller's transaction. */
export async function lockOperation(tx: Tx, tenantId: string, agentId: string, id: string) {
  const [current] = await tx
    .select()
    .from(operations)
    .where(operationIdentity(tenantId, agentId, id))
    .for("update");
  return current;
}

/**
 * Writes a terminal policy outcome inside the caller's transaction, which already holds the
 * operation's row lock and has checked it is not terminal.
 */
export async function finishPolicyOperationInTransaction(
  tx: Tx,
  current: OperationRecord,
  status: "completed" | "failed",
  result: unknown,
): Promise<OperationRecord> {
  const [persisted] = await tx
    .update(operations)
    .set({
      status,
      result: mergeOperationEvidence(current.result, redactOperationResult(result, "policy")),
      updatedAt: sql`clock_timestamp()`,
    })
    .where(operationIdentity(current.tenantId, current.agentId, current.id))
    .returning();
  if (!persisted) throw new Error("operation_not_found");
  await tx.insert(auditEvents).values({
    tenantId: current.tenantId,
    agentId: current.agentId,
    action: `policy.${status}`,
    resourceId: current.id,
  });
  return persisted;
}

function persistedOperationResult(result: unknown, kind: OperationKind, status: OperationStatus) {
  if (kind !== "sign") return redactOperationResult(result, kind);
  const projected = redactOperationResult(result, kind);
  const record =
    projected && typeof projected === "object" && !Array.isArray(projected)
      ? (projected as Record<string, unknown>)
      : {};
  return {
    redacted: true,
    artifact_redacted: true,
    status: typeof record.status === "string" ? record.status : status,
    ...(typeof record.failure_code === "string" ? { failure_code: record.failure_code } : {}),
    ...(typeof record.provider_request_id === "string" || record.provider_request_id === null
      ? { provider_request_id: record.provider_request_id }
      : {}),
  };
}

const operationIdentity = (tenantId: string, agentId: string, id: string) =>
  and(eq(operations.tenantId, tenantId), eq(operations.agentId, agentId), eq(operations.id, id));

function mergeOperationEvidence(priorResult: unknown, nextResult: unknown): unknown {
  if (!nextResult || typeof nextResult !== "object" || Array.isArray(nextResult)) return nextResult;
  const prior =
    priorResult && typeof priorResult === "object" && !Array.isArray(priorResult)
      ? (priorResult as Record<string, unknown>)
      : {};
  const incoming = nextResult as Record<string, unknown>;
  for (const identity of ["action", "provider_request_id"]) {
    if (
      prior[identity] != null &&
      incoming[identity] != null &&
      prior[identity] !== incoming[identity]
    )
      throw new Error("operation_evidence_conflict");
  }
  const evidence = {
    ...(prior.evidence && typeof prior.evidence === "object" ? prior.evidence : {}),
    ...(incoming.evidence && typeof incoming.evidence === "object" ? incoming.evidence : {}),
  };
  return {
    ...prior,
    ...Object.fromEntries(Object.entries(incoming).filter(([, value]) => value != null)),
    ...(Object.keys(evidence).length ? { evidence } : {}),
  };
}

/**
 * Claims an admitted operation for dispatch, conditional on the status it was admitted in. From
 * here a provider may receive the request, so the operation reads `uncertain` until its result is
 * persisted: a crash or failed completion write can no longer leave it looking undispatched.
 */
export async function claimOperationDispatch(
  tenantId: string,
  agentId: string,
  id: string,
  admitted: "pending" | "uncertain",
  requestHash: string,
): Promise<boolean> {
  return getDatabase().transaction(async (tx) => {
    // Revocation updates the same rows, so its commit serializes against the claim.
    const authority = await lockDispatchAuthority(tx, tenantId, agentId, id);
    if ("refusal" in authority) return false;
    if (authority.operation.status !== admitted || authority.operation.requestHash !== requestHash)
      return false;
    const claimed = await tx
      .update(operations)
      .set({
        status: "uncertain",
        dispatchClaimedAt: sql`coalesce(${operations.dispatchClaimedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(and(operationIdentity(tenantId, agentId, id), eq(operations.status, admitted)))
      .returning({ id: operations.id });
    return claimed.length === 1;
  });
}

/**
 * Leases an uncommitted `uncertain` operation for its first provider dispatch. A committed
 * operation stays uncertain until observed or reconciled because provider idempotency retention
 * is undocumented. A delayed job returns to `dispatching` so the fence admits the first write.
 */
export async function leaseOperationRecovery(
  tenantId: string,
  agentId: string,
  id: string,
): Promise<boolean> {
  return getDatabase().transaction(async (tx) => {
    const leased = await tx
      .update(operations)
      .set({ updatedAt: sql`now()` })
      .where(
        and(
          operationIdentity(tenantId, agentId, id),
          eq(operations.status, "uncertain"),
          lt(operations.updatedAt, sql`now() - interval '10 minutes'`),
          isNull(operations.dispatchCommittedAt),
        ),
      )
      .returning({ id: operations.id });
    if (!leased.length) return false;
    await tx
      .update(delayedExecutions)
      .set({ state: "dispatching", updatedAt: sql`now()` })
      .where(
        and(
          eq(delayedExecutions.tenantId, tenantId),
          eq(delayedExecutions.agentId, agentId),
          eq(delayedExecutions.id, id),
          eq(delayedExecutions.state, "uncertain"),
        ),
      );
    return true;
  });
}

/** Returns a recovered delayed job to the terminal state matching its operation. */
export async function settleRecoveredDelayedJob(
  tenantId: string,
  agentId: string,
  id: string,
  status: OperationStatus,
): Promise<void> {
  await getDatabase()
    .update(delayedExecutions)
    .set({ state: status === "uncertain" ? "uncertain" : "finished", updatedAt: sql`now()` })
    .where(
      and(
        eq(delayedExecutions.tenantId, tenantId),
        eq(delayedExecutions.agentId, agentId),
        eq(delayedExecutions.id, id),
        eq(delayedExecutions.state, "dispatching"),
      ),
    );
}

/** Fails an operation that was never claimed. A claimed or earlier uncertain one is untouched. */
export async function refuseUnclaimedOperation(
  tenantId: string,
  agentId: string,
  id: string,
  kind: OperationKind,
  failureCode: string,
): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const refused = await tx
      .update(operations)
      .set({
        status: "failed",
        result: persistedOperationResult(
          { status: "failed", failure_code: failureCode },
          kind,
          "failed",
        ),
        updatedAt: sql`now()`,
      })
      .where(and(operationIdentity(tenantId, agentId, id), eq(operations.status, "pending")))
      .returning({ id: operations.id });
    if (refused.length)
      await tx
        .insert(auditEvents)
        .values({ tenantId, agentId, action: `${kind}.failed`, resourceId: id });
  });
}

/** Bounds how many stuck operations one sweep pass fails, like the other maintenance sweeps. */
const unclaimedOperationSweepBatchSize = 100;
export const dispatchNeverClaimedFailureCode = "dispatch_never_claimed";

/**
 * Fails a `pending` operation whose process crashed before `claimOperationDispatch` ever ran. The
 * claim precedes every provider call on the `runOperation` path, so a row still `pending` with no
 * `dispatch_claimed_at` this long after admission provably never reached a provider.
 *
 * Excluded, and why each stays safe to leave `pending` indefinitely:
 * - A delayed/timelocked execution is `pending` by design while its job waits, however long the
 *   delay is; a matching `delayed_executions` row (kept for the operation's whole lifetime)
 *   identifies it regardless of age.
 * - Policy preparation and onboarding (`owner-policy-preparation.ts`, `owner-policy-submission.ts`,
 *   `onboarding-service.ts`) are claimed by `runOperation` before it re-persists `pending` with a
 *   `pending_wallet_signature` result, so `dispatch_claimed_at` is already set for them.
 */
export async function sweepUnclaimedOperations(): Promise<number> {
  return getDatabase().transaction(async (tx) => {
    const candidates = await tx
      .select({
        tenantId: operations.tenantId,
        agentId: operations.agentId,
        id: operations.id,
        kind: operations.kind,
      })
      .from(operations)
      .where(
        and(
          eq(operations.status, "pending"),
          isNull(operations.dispatchClaimedAt),
          lt(operations.createdAt, sql`now() - interval '10 minutes'`),
          notExists(
            tx
              .select({ id: delayedExecutions.id })
              .from(delayedExecutions)
              .where(
                and(
                  eq(delayedExecutions.tenantId, operations.tenantId),
                  eq(delayedExecutions.agentId, operations.agentId),
                  eq(delayedExecutions.id, operations.id),
                ),
              ),
          ),
        ),
      )
      .orderBy(operations.createdAt)
      .limit(unclaimedOperationSweepBatchSize)
      .for("update", { skipLocked: true });

    let failedCount = 0;
    for (const candidate of candidates) {
      const failed = await tx
        .update(operations)
        .set({
          status: "failed",
          result: persistedOperationResult(
            { status: "failed", failure_code: dispatchNeverClaimedFailureCode },
            candidate.kind,
            "failed",
          ),
          updatedAt: sql`now()`,
        })
        .where(
          and(
            operationIdentity(candidate.tenantId, candidate.agentId, candidate.id),
            eq(operations.status, "pending"),
            isNull(operations.dispatchClaimedAt),
          ),
        )
        .returning({ id: operations.id });
      if (!failed.length) continue;
      failedCount += 1;
      await tx.insert(auditEvents).values({
        tenantId: candidate.tenantId,
        agentId: candidate.agentId,
        resourceId: candidate.id,
        action: `${candidate.kind}.failed`,
      });
    }
    return failedCount;
  });
}

export const dispatchNeverCommittedFailureCode = "dispatch_never_committed";

/**
 * Operation kinds whose every provider write is immediately preceded by `commitDispatch`. Policy
 * operations are excluded: their preparation calls the provider before the owner signs, and their
 * submission has its own claim.
 */
const committedDispatchKinds: OperationKind[] = ["execute", "sign", "relay"];

/**
 * Fails an operation that was claimed but never committed. Commitment precedes every provider
 * write of these kinds, so such an operation provably never reached a provider; it does not depend
 * on provider idempotency. The idle hour leaves room for live preparation. Even when a slow attempt is swept, its later `commitDispatch` locks the
 * same row, sees a terminal status and refuses, so the sweep can never race a write.
 *
 * A delayed job left `dispatching` or `uncertain` for the operation is finished with it.
 */
export async function sweepUncommittedOperations(): Promise<number> {
  return getDatabase().transaction(async (tx) => {
    const candidates = await tx
      .select({
        tenantId: operations.tenantId,
        agentId: operations.agentId,
        id: operations.id,
        kind: operations.kind,
        result: operations.result,
      })
      .from(operations)
      .where(
        and(
          eq(operations.status, "uncertain"),
          inArray(operations.kind, committedDispatchKinds),
          isNotNull(operations.dispatchClaimedAt),
          isNull(operations.dispatchCommittedAt),
          lt(operations.updatedAt, sql`now() - interval '1 hour'`),
        ),
      )
      .orderBy(operations.updatedAt)
      .limit(unclaimedOperationSweepBatchSize)
      .for("update", { skipLocked: true });

    let failedCount = 0;
    for (const candidate of candidates) {
      const prior =
        candidate.result && typeof candidate.result === "object" && !Array.isArray(candidate.result)
          ? candidate.result
          : {};
      const failed = await tx
        .update(operations)
        .set({
          status: "failed",
          result: persistedOperationResult(
            { ...prior, status: "failed", failure_code: dispatchNeverCommittedFailureCode },
            candidate.kind,
            "failed",
          ),
          updatedAt: sql`now()`,
        })
        .where(
          and(
            operationIdentity(candidate.tenantId, candidate.agentId, candidate.id),
            eq(operations.status, "uncertain"),
            isNull(operations.dispatchCommittedAt),
          ),
        )
        .returning({ id: operations.id });
      if (!failed.length) continue;
      failedCount += 1;
      await tx
        .update(delayedExecutions)
        .set({
          state: "finished",
          ciphertext: null,
          nonce: null,
          keyId: null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(delayedExecutions.tenantId, candidate.tenantId),
            eq(delayedExecutions.agentId, candidate.agentId),
            eq(delayedExecutions.id, candidate.id),
            inArray(delayedExecutions.state, ["dispatching", "uncertain"]),
          ),
        );
      await tx.insert(auditEvents).values({
        tenantId: candidate.tenantId,
        agentId: candidate.agentId,
        resourceId: candidate.id,
        action: `${candidate.kind}.failed`,
      });
    }
    return failedCount;
  });
}

/**
 * Keeps what the provider returned before any derived completion work runs, so a failure there
 * still leaves the provider reference that refresh and reconciliation need.
 */
export async function recordDispatchEvidence(
  tenantId: string,
  agentId: string,
  id: string,
  kind: OperationKind,
  result: unknown,
  providerReference: string | null,
): Promise<void> {
  await getDatabase().transaction(async (tx) => {
    const recorded = await tx
      .update(operations)
      .set({
        result: persistedOperationResult(result, kind, "uncertain"),
        // A provider answer proves dispatch, so this row can never read as uncommitted.
        dispatchCommittedAt: sql`coalesce(${operations.dispatchCommittedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(and(operationIdentity(tenantId, agentId, id), eq(operations.status, "uncertain")))
      .returning({ id: operations.id });
    if (recorded.length)
      await tx.insert(auditEvents).values({
        tenantId,
        agentId,
        action: `${kind}.dispatched`,
        resourceId: id,
        providerReference,
      });
  });
}

export async function updateOperationResult(
  tenantId: string,
  agentId: string,
  id: string,
  kind: OperationKind,
  status: OperationStatus,
  result: unknown,
  onPersist?: (tx: Tx) => Promise<void>,
): Promise<OperationRecord | null> {
  return getDatabase().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(operations)
      .where(operationIdentity(tenantId, agentId, id))
      .for("update");
    if (!current) return null;
    if (
      current.status === "completed" ||
      current.status === "failed" ||
      (current.status === "uncertain" && status === "pending")
    )
      return current;
    const merged = mergeOperationEvidence(current.result, redactOperationResult(result, kind));
    const [persisted] = await tx
      .update(operations)
      .set({ result: merged, status, updatedAt: sql`clock_timestamp()` })
      .where(operationIdentity(tenantId, agentId, id))
      .returning();
    if (onPersist) await onPersist(tx);
    return persisted ?? null;
  });
}
