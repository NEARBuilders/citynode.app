import {
  canonical,
  canonicalChain,
  type ExecutionRequest,
  executionResultSchema,
  operationStatusSchema,
} from "@near-intents-agent-api/contracts";
import { getRuntime } from "../../config/runtime.js";
import { getOutlayer } from "../../lib/outlayer.js";
import { getTokenCatalog } from "../../lib/token-catalog.js";
import type { Actor } from "../../shared/actor.js";
import { hashSecret } from "../../shared/crypto.js";
import { ApiError } from "../../shared/errors.js";
import { grantCheckForExecution } from "../agents/grant-constraints.js";
import { authorizeDelegatedAction, type GrantSelector } from "../agents/grant-service.js";
import { findAgent } from "../agents/repository.js";
import { requireBoundAgent } from "../agents/service.js";
import { requireReadyPolicy } from "../wallet/policy-readiness.js";
import { custodyCredential } from "../wallet/service.js";
import { dispatchExecution } from "./execution-dispatch.js";
import { toOperationDto } from "./mapper.js";
import { classifyExecutionOutcome } from "./outcome.js";
import { providerDeduplicatesResubmission } from "./provider-dispatch.js";
import { depositIntentId, observeDeposit } from "./provider-observation.js";
import { providerResult, readString } from "./provider-result.js";
import {
  findOperation,
  leaseOperationRecovery,
  settleRecoveredDelayedJob,
  updateOperationResult,
} from "./repository.js";
import { readOperation, runOperation } from "./service.js";

function timingFor(
  resume: { operationId: string; grantId: string } | undefined,
  delaySeconds: number,
  nearAccountId: string,
  request: ExecutionRequest,
  grantId: string,
  ownerEpoch: number,
) {
  if (resume) return { reserved: true, reservedOperationId: resume.operationId };
  if (!delaySeconds) return {};
  return {
    delayed: { delaySeconds, nearAccountId, action: request.action, request, grantId, ownerEpoch },
  };
}

/**
 * Fund-moving actions call OutLayer `/wallet/v1/*` with the stored custody credential.
 * The provider's wallet policy is the authority boundary; this server never signs.
 *
 * `grant` is the caller's grant token. Only a resume of an admitted operation names its grant by
 * id, and a resume must run under the exact grant that admitted it.
 */
export async function execute(
  actor: Actor,
  agentId: string,
  input: ExecutionRequest,
  grant: GrantSelector,
  resume?: { operationId: string; grantId: string },
) {
  const { wallet } = await requireBoundAgent(actor, agentId);
  await requireReadyPolicy(actor.tenantId, agentId);
  let sourceChain: string | undefined;
  if (input.action === "cross_chain_deposit" && input.request.source_asset) {
    const source = (await getTokenCatalog().list()).find(
      (token) => token.assetId === input.request.source_asset,
    );
    sourceChain = source?.blockchain;
    if (
      !sourceChain ||
      (input.request.chain && canonicalChain(input.request.chain) !== canonicalChain(sourceChain))
    )
      throw new ApiError("grant_destination_unresolved", 403);
  }
  const check = grantCheckForExecution(input, getRuntime().network, sourceChain);
  // A tenant API key is not an owner delegation. The grant the request names is checked against
  // the exact action and every destination before the request can reach a provider write.
  const decision = await authorizeDelegatedAction({
    actor,
    agentId,
    grant,
    action: input.action,
    check,
    walletId: wallet.providerWalletId,
  });
  if (resume && decision.grantId !== resume.grantId) throw new ApiError("authorization_stale", 409);
  const agent = await findAgent(actor.tenantId, agentId);
  if (!agent || agent.policyEpoch !== decision.authorizationEpochs.policyEpoch)
    throw new ApiError("authorization_stale", 409);
  return runOperation({
    actor,
    agentId,
    kind: "execute",
    action: input.action,
    idempotencyKey: input.request.idempotencyKey,
    request: input,
    ...timingFor(
      resume,
      agent.timelockDelaySeconds,
      wallet.nearAccountId,
      input,
      decision.grantId,
      decision.authorizationEpochs.ownerEpoch,
    ),
    grant: { id: decision.grantId, label: decision.label },
    authorizationEpochs: decision.authorizationEpochs,
    run: (operationId) => dispatchExecution(actor, agentId, wallet, input, operationId),
  });
}

/**
 * Observation only. A refresh may query the provider for an already-submitted request and record
 * what it learns; it must never itself submit work. Recovery of an operation with no provider
 * request id lives on the explicit retry path, which requires the writer's scope, the stored
 * authorization proof and the current dispatch fence.
 */
export async function refreshExecution(actor: Actor, agentId: string, operationId: string) {
  const prior = await readOperation(actor, agentId, operationId);
  // Deletion completes only through `refreshDeletion`, which retires the custody wallet with it.
  if (prior.kind !== "execute" || (prior.result as { action?: string } | null)?.action === "delete")
    throw new ApiError("operation_kind_mismatch", 409);
  if (prior.status === "completed" || prior.status === "failed")
    return toOperationDto(actor, prior);
  const result = prior.result as { provider_request_id?: string | null } | null;
  const intentId = depositIntentId(result);
  if (!result?.provider_request_id && !intentId) return toOperationDto(actor, prior);
  const { wallet } = await requireBoundAgent(actor, agentId);
  const refreshed = intentId
    ? await observeDeposit(custodyCredential(wallet), intentId, result)
    : await observeRequest(custodyCredential(wallet), result?.provider_request_id ?? "");
  const priorEvidence =
    result && typeof result === "object"
      ? ((result as { evidence?: Record<string, unknown> }).evidence ?? {})
      : {};
  const merged = executionResultSchema.parse({
    ...result,
    ...refreshed,
    // A follow-up status can carry the receipt that was absent at submission. Merging the new
    // provider fields over the stored evidence is what lets the classifier promote a pending
    // operation to completed; keeping the stale evidence would leave it uncertain forever.
    evidence: { ...priorEvidence, ...refreshed },
  });
  const classification = classifyExecutionOutcome(
    typeof merged.action === "string" ? merged.action : null,
    merged,
  );
  // Refresh re-persists provider data, so it must pass the same redaction boundary as first write.
  const persisted = await updateOperationResult(
    actor.tenantId,
    agentId,
    operationId,
    "execute",
    operationStatusSchema.parse(classification.status),
    merged,
  );
  if (!persisted) throw new ApiError("operation_not_found", 404);
  return toOperationDto(actor, persisted);
}

async function observeRequest(credential: string, requestId: string) {
  const provider = await getOutlayer().requestStatus(credential, requestId);
  if (readString(provider, "request_id") !== requestId)
    throw new ApiError("provider_request_mismatch", 502);
  return providerResult(provider);
}

/**
 * Recovers an execution left `uncertain` only when its dispatch commitment never happened. That
 * proves no provider write began, so this is its first dispatch. A committed operation with lost
 * response stays uncertain for provider reconciliation; idempotency retention is undocumented.
 */
export async function recoverExecution(
  actor: Actor,
  agentId: string,
  operationId: string,
  input: ExecutionRequest,
  grantToken: string | undefined,
) {
  const prior = await readOperation(actor, agentId, operationId);
  if (prior.kind !== "execute") throw new ApiError("operation_kind_mismatch", 409);
  const stored = prior.result as { provider_request_id?: string | null } | null;
  if (
    prior.status !== "uncertain" ||
    stored?.provider_request_id ||
    !prior.authorizedGrantId ||
    !providerDeduplicatesResubmission(input)
  )
    throw new ApiError("operation_not_recoverable", 409);
  if (prior.requestHash !== hashSecret(canonical(input)))
    throw new ApiError("idempotency_conflict", 409);
  if (!(await leaseOperationRecovery(actor.tenantId, agentId, operationId)))
    throw new ApiError("operation_recovery_unavailable", 409);
  try {
    // The caller's token must name the grant that admitted the operation; another grant, even a
    // live one on the same agent, cannot adopt it.
    return await execute(
      actor,
      agentId,
      input,
      { token: grantToken },
      { operationId, grantId: prior.authorizedGrantId },
    );
  } finally {
    const settled = await findOperation(actor.tenantId, agentId, operationId);
    if (settled)
      await settleRecoveredDelayedJob(actor.tenantId, agentId, operationId, settled.status);
  }
}
