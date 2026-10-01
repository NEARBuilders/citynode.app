import { z } from "zod";
import { agentViewSchema } from "./agents.js";
import { idSchema, nearAccountSchema, ownerWalletSchema } from "./common.js";
import { evmWalletRequestMessageSchema } from "./evm-wallet.js";
import { nearPolicyRequestSchema, policySchema, signedNearPolicySchema } from "./policy.js";
import { walletRequestMessageSchema } from "./wallet-request.js";

/**
 * An agent never exists without an owner and a policy. Creation names both; the owner then signs
 * one exact on-chain request that installs the policy under the owner's wallet. That signature is
 * the binding proof, the policy consent and the transaction authorization at once.
 */
const createAgentSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  externalUserId: z.string().min(1).max(200).optional(),
  owner: ownerWalletSchema,
  policy: policySchema,
});

const onboardingStatusSchema = z.enum([
  "pending_wallet_signature",
  "dispatching",
  "submitted",
  "applied",
  "failed",
]);

const onboardingViewSchema = z.strictObject({
  operation_id: idSchema,
  status: onboardingStatusSchema,
  owner: ownerWalletSchema,
  /** NEAR account that becomes the provider policy controller: named account or `0s` wallet. */
  controller_id: nearAccountSchema,
  wallet_id: z.string().min(1).max(256),
  policy_hash: idSchema,
  policy: policySchema,
  /** The request must be signed and submitted before this instant. */
  expires_at: z.iso.datetime(),
  transaction_hash: z.string().max(128).nullable(),
  failure_code: z.string().max(128).nullable(),
  /** NEAR owners sign this as one NEP-366 delegate. */
  near_policy_request: nearPolicyRequestSchema.optional(),
  /** Passkey and EVM owners sign this exact wallet-contract request. */
  wallet_request: z.union([walletRequestMessageSchema, evmWalletRequestMessageSchema]).optional(),
});

const agentOnboardingSchema = z.strictObject({
  agent: agentViewSchema,
  onboarding: onboardingViewSchema,
});

/** The owner's single signature over the prepared request, exactly as returned. */
const onboardingSignatureSchema = z.union([
  z.strictObject({
    msg: z.union([walletRequestMessageSchema, evmWalletRequestMessageSchema]),
    proof: z.string().min(1).max(16_384),
  }),
  signedNearPolicySchema,
]);

export type CreateAgent = z.infer<typeof createAgentSchema>;
export type OnboardingView = z.infer<typeof onboardingViewSchema>;
export type AgentOnboarding = z.infer<typeof agentOnboardingSchema>;
export type OnboardingSignature = z.infer<typeof onboardingSignatureSchema>;
