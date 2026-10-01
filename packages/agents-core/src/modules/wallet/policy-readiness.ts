import { canonical, type Policy, policySchema } from "@near-intents-agent-api/contracts";
import { getOutlayer } from "../../lib/outlayer.js";
import { ApiError } from "../../shared/errors.js";
import { nearPolicyOwnerMatches } from "../../shared/near.js";
import { requireActiveAgent } from "../agents/lifecycle-service.js";
import { requireBoundOwnerAgent } from "../agents/service.js";
import { latestPolicy } from "./repository.js";
import { custodyCredential, requireActiveWallet } from "./service.js";

/** Read back every signed field. Cache invalidation alone is not policy evidence. */
export function matchesProviderPolicy(value: unknown, walletId: string, policy: Policy) {
  if (!value || typeof value !== "object") return false;
  const provider = value as Record<string, unknown>;
  return (
    provider.wallet_id === walletId &&
    provider.frozen === policy.frozen &&
    canonical(provider.rules ?? null) === canonical(policy.rules) &&
    canonical(provider.capabilities ?? null) === canonical(policy.capabilities) &&
    canonical(provider.approval ?? null) === canonical(policy.approval ?? null)
  );
}

export async function requireReadyPolicy(tenantId: string, agentId: string) {
  await requireActiveAgent(tenantId, agentId);
  const policy = await latestPolicy(tenantId, agentId);
  if (policy?.status !== "applied" || policy.failureReason)
    throw new ApiError("policy_not_ready", 409);
  const wallet = await requireActiveWallet(tenantId, agentId);
  const owner = await requireBoundOwnerAgent(tenantId, agentId);
  const parsed = policySchema.safeParse(policy.rules);
  if (!parsed.success) throw new ApiError("policy_not_ready", 409);
  const rules = parsed.data;
  if (rules.frozen) throw new ApiError("agent_paused", 409);
  const current = await getOutlayer().policy(custodyCredential(wallet));
  if (
    !matchesProviderPolicy(current, wallet.providerWalletId, rules) ||
    !(await nearPolicyOwnerMatches({
      contractId: getOutlayer().contractId,
      nearAccountId: wallet.nearAccountId,
      expectedOwner: owner.ownerAccountId,
    }))
  )
    throw new ApiError("provider_policy_mismatch", 409);
}
