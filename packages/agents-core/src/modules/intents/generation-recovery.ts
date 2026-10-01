import { canonical, policySchema } from "@near-intents-agent-api/contracts";
import type { GenerateIntentRequest } from "@near-intents-agent-api/contracts/api";
import type { Actor } from "../../shared/actor.js";
import { hashSecret } from "../../shared/crypto.js";
import { getOnboarding } from "../agents/onboarding-service.js";
import { requireBoundAgent } from "../agents/service.js";
import { findOperation } from "../operations/repository.js";
import { operationIdFor } from "../operations/service.js";
import { preparedSchema } from "../wallet/prepared-policy.js";
import type { Draft } from "./generate.js";
import {
  freezeSummary,
  onboardingDraft,
  policySummary,
  preparedPolicyDraft,
} from "./prepared-drafts.js";

/** Observe completed local preparation only. No builder, provider call or new resource identity. */
export async function recoverPreparedGeneration(
  actor: Actor,
  request: GenerateIntentRequest,
  generation: { id: string; agentId: string },
): Promise<Draft | undefined> {
  try {
    if (request.type === "agent_create") {
      const created = await getOnboarding(actor, generation.agentId);
      const operation = await findOperation(
        actor.tenantId,
        generation.agentId,
        created.onboarding.operation_id,
      );
      if (
        operation?.status !== "pending" ||
        created.agent.status !== "pending" ||
        created.onboarding.status !== "pending_wallet_signature" ||
        canonical(created.onboarding.owner) !== canonical(request.owner) ||
        created.onboarding.policy_hash !== hashSecret(canonical(policySchema.parse(request.policy)))
      )
        return undefined;
      return onboardingDraft(request, created);
    }
    if (!["policy_update", "agent_freeze", "agent_unfreeze"].includes(request.type))
      return undefined;
    const id = operationIdFor(
      actor.tenantId,
      generation.agentId,
      "policy",
      `intent:${generation.id}`,
    );
    const operation = await findOperation(actor.tenantId, generation.agentId, id);
    const prepared = preparedSchema.safeParse(operation?.result);
    if (!operation || !prepared.success) return undefined;
    const { agent, wallet } = await requireBoundAgent(actor, generation.agentId);
    if (
      !agent.ownerIdentity ||
      operation.authorizedOwnerEpoch !== agent.ownerEpoch ||
      prepared.data.controller_id !== agent.ownerAccountId ||
      prepared.data.wallet_id !== wallet.providerWalletId
    )
      return undefined;
    return preparedPolicyDraft(
      agent.ownerIdentity,
      operation,
      request.type === "policy_update"
        ? policySummary(request.expectedRevision, request.policy.frozen)
        : freezeSummary(request.type === "agent_freeze"),
    );
  } catch {
    // Missing/incomplete/retired evidence cannot authorize another preparation.
    return undefined;
  }
}
