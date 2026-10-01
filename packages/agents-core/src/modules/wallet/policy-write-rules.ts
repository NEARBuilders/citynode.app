import type { Policy } from "@near-intents-agent-api/contracts";
import { ApiError } from "../../shared/errors.js";

/**
 * Refuses policy combinations OutLayer stores but then refuses on every matching operation, so an
 * owner never signs a policy that cannot work. OutLayer evaluates the address rule on every
 * operation, and shield and unshield name no recipient, so a whitelist refuses them with
 * `policy_denied`, including the agent's own confidential balance. Only new writes are checked;
 * stored policies are read as they are.
 */
export function assertPolicyWritable(policy: Policy) {
  if (policy.capabilities.confidential.allowed && policy.rules.addresses?.mode === "whitelist")
    throw new ApiError("policy_confidential_whitelist_conflict", 400);
}
