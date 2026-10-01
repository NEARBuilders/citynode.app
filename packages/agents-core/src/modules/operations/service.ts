import type {
  Operation as OperationContract,
  SigningArtifactAction,
} from "@near-intents-agent-api/contracts";
import { canonical } from "@near-intents-agent-api/contracts";
import type { Tx } from "@near-intents-agent-api/database";
import { OutlayerError } from "@near-intents-agent-api/outlayer";
import { RelayError } from "@near-intents-agent-api/relayer";
import type { Actor } from "../../shared/actor.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { findAgent } from "../agents/repository.js";
import { assertDispatchFence, currentEpochs, type DispatchEpochs } from "./dispatch-fence.js";
import { toOperationDto } from "./mapper.js";
import {
  isPreBroadcastRefusalCode,
  isProviderPreBroadcastRefusal,
  operationStatusFor,
} from "./outcome.js";
import {
  claimOperationDispatch,
  createPendingOperation,
  findOperation,
  type OperationRecord,
  persistOperationResult,
  recordDispatchEvidence,
  refuseUnclaimedOperation,
  type SigningArtifactPersistence,
} from "./repository.js";
import type { OperationKind } from "./schema.js";

export type Operation<T = unknown> = OperationContract<T>;

export { operationStatusFor } from "./outcome.js";

type RunOperationInput = {
  actor: Actor;
  agentId: string;
  kind: OperationKind;
  /** Recorded at admission; see `operations.action`. */
  action?: string;
  idempotencyKey: string;
  request: unknown;
  run: (id: string) => Promise<unknown>;
  delayed?: Parameters<typeof createPendingOperation>[0]["delayed"];
  reserved?: boolean;
  /** Existing identity when resuming a reserved operation. */
  reservedOperationId?: string;
  /**
   * Grant the action was authorized under. It namespaces the idempotency key, so two grants never
   * share an operation, and is recorded so status and audit can attribute the delegation.
   */
  grant?: { id: string; label: string };
  /** Epochs captured with the delegated grant decision. */
  authorizationEpochs?: DispatchEpochs;
  /** Signing-artifact scope; required for a completed sign result. */
  signingAction?: SigningArtifactAction;
  /** Keep action-specific terminal state in the same transaction as the operation result. */
  onPersist?: (tx: Tx, status: OperationRecord["status"]) => Promise<void>;
};

/**
 * Delegated work is namespaced by its grant, so the same key under two grants names two
 * operations; owner-signed and service work have no grant.
 */
export function operationIdFor(
  tenantId: string,
  agentId: string,
  kind: OperationKind,
  idempotencyKey: string,
  grantId?: string,
) {
  return hashSecret(
    canonical({
      tenant: tenantId,
      agent: agentId,
      kind,
      idempotencyKey,
      ...(grantId ? { grant: grantId } : {}),
    }),
  );
}

function operationIdForRun(input: RunOperationInput): string {
  if (input.reserved) {
    if (input.reservedOperationId) return input.reservedOperationId;
    throw new ApiError("operation_not_found", 404);
  }
  return operationIdFor(
    input.actor.tenantId,
    input.agentId,
    input.kind,
    input.idempotencyKey,
    input.grant?.id,
  );
}

/** An idempotent replay returns its existing operation; otherwise the status it was admitted in. */
type PreparedOperation = { existing: Operation } | { admitted: "pending" | "uncertain" };

/** A replay or resume must match the admitted operation's kind, body and grant exactly. */
function assertSameRequest(prior: OperationRecord, input: RunOperationInput, requestHash: string) {
  if (
    prior.kind !== input.kind ||
    prior.requestHash !== requestHash ||
    (prior.authorizedGrantId ?? null) !== (input.grant?.id ?? null)
  )
    throw new ApiError("idempotency_conflict", 409);
}

async function prepareOperation(
  input: RunOperationInput,
  id: string,
  requestHash: string,
): Promise<PreparedOperation> {
  const { actor, agentId, kind } = input;
  if (input.reserved) {
    if (input.reservedOperationId !== id) throw new ApiError("operation_not_found", 404);
    const prior = await findOperation(actor.tenantId, agentId, id);
    if (!prior) throw new ApiError("operation_not_found", 404);
    assertSameRequest(prior, input, requestHash);
    if (prior.status !== "pending" && prior.status !== "uncertain")
      throw new ApiError("operation_not_pending", 409);
    return { admitted: prior.status };
  }

  const authorizationEpochs =
    input.authorizationEpochs ?? (await currentEpochs(actor.tenantId, agentId));
  const inserted = await createPendingOperation({
    id,
    tenantId: actor.tenantId,
    agentId,
    actorKeyId: actor.keyId,
    kind,
    action: input.action,
    requestHash,
    authorizationEpochs,
    grant: input.grant,
    delayed: input.delayed,
  });
  if (inserted.length) return { admitted: "pending" };

  const prior = await findOperation(actor.tenantId, agentId, id);
  if (!prior) throw new ApiError("operation_retired", 409);
  assertSameRequest(prior, input, requestHash);
  return { existing: await toOperationDto(actor, prior) };
}

function signingArtifactForResult(
  input: RunOperationInput,
  status: OperationRecord["status"],
): SigningArtifactPersistence | undefined {
  if (input.kind !== "sign" || status !== "completed") return;
  if (!input.grant || !input.authorizationEpochs || !input.signingAction)
    throw new Error("signing_artifact_provenance_required");
  return {
    grantId: input.grant.id,
    ownerEpoch: input.authorizationEpochs.ownerEpoch,
    action: input.signingAction,
  };
}

async function persistRunResult(
  input: RunOperationInput,
  id: string,
  requestHash: string,
  result: unknown,
) {
  const status = operationStatusFor(input.kind, result);
  const completionEpochs = await currentEpochs(input.actor.tenantId, input.agentId);
  const signingArtifact = signingArtifactForResult(input, status);
  const auditEpochs =
    input.kind === "sign" && input.authorizationEpochs
      ? input.authorizationEpochs
      : completionEpochs;
  const providerRequestId = providerReference(result);
  const onPersist = input.onPersist;
  const persisted = await persistOperationResult(
    input.actor.tenantId,
    input.agentId,
    id,
    input.kind,
    status,
    result,
    {
      actorKeyId: input.actor.keyId,
      requestHash,
      ...(input.grant ? { grantId: input.grant.id } : {}),
      ...(providerRequestId ? { providerReference: providerRequestId } : {}),
      ...auditEpochs,
    },
    signingArtifact,
    onPersist ? (tx) => onPersist(tx, status) : undefined,
  );
  return toOperationDto(input.actor, persisted);
}

export async function runOperation(input: RunOperationInput) {
  const { actor, agentId, kind, request, run } = input;
  const id = operationIdForRun(input);
  const requestHash = hashSecret(canonical(request));
  const prepared = await prepareOperation(input, id, requestHash);
  if ("existing" in prepared) return prepared.existing;
  if (input.delayed) {
    const queued = await findOperation(actor.tenantId, agentId, id);
    if (!queued) throw new ApiError("operation_not_found", 404);
    return toOperationDto(actor, queued);
  }

  try {
    // New operations persist their admission snapshot with insertion. Reserved resumes must use
    // that same snapshot and can never inherit epochs from the current agent row.
    await assertDispatchFence(actor.tenantId, agentId, id);
    if (
      !(await claimOperationDispatch(actor.tenantId, agentId, id, prepared.admitted, requestHash))
    )
      throw new ApiError("operation_not_pending", 409);
  } catch (error) {
    // Nothing was handed to `run`, so no provider saw this attempt.
    await refuseUnclaimedOperation(actor.tenantId, agentId, id, kind, failureCode(error));
    throw error;
  }

  try {
    const result = await run(id);
    await recordDispatchEvidence(
      actor.tenantId,
      agentId,
      id,
      kind,
      result,
      providerReference(result),
    );
    return await persistRunResult(input, id, requestHash, result);
  } catch (error) {
    // The claim already recorded uncertainty. Only a typed refusal proves this attempt never
    // reached a provider, and a resumed operation's earlier attempt may still have landed.
    if (prepared.admitted === "pending" && isPreBroadcastRefusalError(error))
      await persistOperationResult(actor.tenantId, agentId, id, kind, "failed", {
        status: "failed",
        failure_code: error.code,
      });
    throw error;
  }
}

function failureCode(error: unknown): string {
  return error instanceof ApiError || error instanceof RelayError || error instanceof OutlayerError
    ? error.code
    : "dispatch_not_started";
}

/**
 * API errors that are provably decided before any provider write. Recording them as failed (rather
 * than uncertain) is what lets a caller fix the input and retry, and what keeps a refused action
 * from being counted as possibly-spent budget.
 *
 * The shared core plus local admission and dispatch-validation failures that prove no provider
 * write started: grant admission, policy revisioning (including an unresolved earlier revision and
 * the provider state a revision is prepared from), owner proof and nonce checks, wallet
 * authorization, detached signing and sponsor-budget reservation, which precedes any sponsor or
 * custody submission.
 */
const admissionRefusalCodes = new Set([
  "agent_grant_required",
  "policy_revision_conflict",
  "policy_reconciliation_required",
  "policy_update_invalid",
  "provider_policy_unavailable",
  "owner_nonce_invalid",
  "owner_counter_conflict",
  "wallet_authorization_required",
  "wallet_authorization_invalid",
  "wallet_authorization_expired",
  "signing_policy_denied",
  "signing_identity_challenge_invalid",
  "sponsor_daily_budget_exhausted",
  "sponsor_busy",
  "spend_budget_exceeded",
  "spend_price_unavailable",
]);

function isPreBroadcastRefusalError(
  error: unknown,
): error is ApiError | RelayError | OutlayerError {
  if (error instanceof RelayError) return true;
  if (error instanceof OutlayerError) return isProviderPreBroadcastRefusal(error);
  if (!(error instanceof ApiError)) return false;
  return isPreBroadcastRefusalCode(error.code) || admissionRefusalCodes.has(error.code);
}

/** Provider request identity from a result, for the audit trail. Never includes secrets. */
function providerReference(result: unknown) {
  if (!result || typeof result !== "object") return null;
  const value = (result as { provider_request_id?: unknown }).provider_request_id;
  return typeof value === "string" ? value : null;
}

export async function readOperation(
  actor: Actor,
  agentId: string,
  id: string,
): Promise<OperationRecord> {
  if (!(await findAgent(actor.tenantId, agentId))) throw new ApiError("agent_not_found", 404);
  const result = await findOperation(actor.tenantId, agentId, id);
  if (!result) throw new ApiError("operation_not_found", 404);
  return result;
}
