import type { AgentOnboarding, OwnerWallet } from "@near-intents-agent-api/contracts";
import type { GenerateIntentRequest } from "@near-intents-agent-api/contracts/api";
import { ApiError } from "../../shared/errors.js";
import type { OperationRecord } from "../operations/repository.js";
import { preparedSchema } from "../wallet/prepared-policy.js";
import type { Draft } from "./generate.js";
import { walletRequestIntent } from "./payloads.js";

function describeOwner(owner: OwnerWallet) {
  if (owner.type === "near") return owner.accountId;
  if (owner.type === "evm") return owner.address;
  return `passkey ${owner.credentialId.slice(0, 12)}…`;
}

export function onboardingDraft(
  request: Extract<GenerateIntentRequest, { type: "agent_create" }>,
  created: AgentOnboarding,
): Draft {
  const built = walletRequestIntent(request.owner, created.onboarding);
  return {
    agentId: created.agent.id,
    signer: request.owner,
    intent: built.intent,
    context: built.context,
    operationId: created.onboarding.operation_id,
    preview: {
      summary: `Create agent "${request.name}" owned by ${describeOwner(request.owner)} and install its first policy.`,
      revision: 1,
      previousRevision: 0,
      policyHash: created.onboarding.policy_hash,
    },
    expiresAtMs: Math.min(built.expiresAtMs, Date.parse(created.onboarding.expires_at)),
  };
}

export function policySummary(revision: number, frozen?: boolean) {
  return `Install account policy revision ${revision + 1}${frozen ? " (frozen: every execution refused)" : ""}. It applies to every connection on this account once the provider confirms it; each grant keeps only the actions and destinations it was signed with.`;
}

export function freezeSummary(frozen: boolean) {
  return frozen
    ? "Freeze this account's wallet: every execution by every connection is refused until it is unfrozen."
    : "Unfreeze this account's wallet: executions resume for every connection under the current policy.";
}

/** Pure projection shared by first generation and recovery. Never refreshes its deadline. */
export function preparedPolicyDraft(
  owner: OwnerWallet,
  operation: OperationRecord,
  summary: string,
): Draft {
  const prepared = preparedSchema.safeParse(operation.result);
  if (
    operation.status !== "pending" ||
    !prepared.success ||
    prepared.data.status !== "pending_wallet_signature"
  )
    throw new ApiError("policy_not_pending", 409);
  const built = walletRequestIntent(owner, prepared.data);
  const revision = prepared.data.expected_revision;
  if (revision === undefined) throw new ApiError("policy_not_pending", 409);
  return {
    agentId: operation.agentId,
    signer: owner,
    intent: built.intent,
    context: built.context,
    operationId: operation.id,
    preview: {
      summary,
      revision: revision + 1,
      previousRevision: revision,
      policyHash: prepared.data.policy_hash,
    },
    // Existing policy preparation lifetime: ten minutes, anchored to durable admission.
    expiresAtMs: Math.min(built.expiresAtMs, operation.createdAt.getTime() + 600_000),
  };
}
