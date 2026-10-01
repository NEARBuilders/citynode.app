import { z } from "zod";
import {
  authenticationResponseSchema,
  nearAccountSchema,
  ownerWalletSchema,
  usdAmountSchema,
} from "../common.js";
import { grantDestinationSchema } from "../destinations.js";
import { grantCommitmentSchema, grantLabelSchema } from "../grants.js";
import { policySchema } from "../policy.js";
import { agentIdSchema, correlationIdSchema } from "./common.js";
import { deletionPreviewSchema } from "./views.js";

/**
 * Owner intents: every action that needs the owner's wallet.
 *
 * Mirrors the 1Click `generate-intent` / `submit-intent` pair. The server builds every byte the
 * owner signs and returns it as `intent: { standard, payload }`; the wallet signs `payload`
 * exactly as returned; the partner backend submits the wallet's output unchanged as
 * `signedData`. The server verifies it against the stored intent and normalizes the encoding.
 */

export const intentTypeSchema = z.enum([
  "agent_create",
  "policy_update",
  "agent_freeze",
  "agent_unfreeze",
  "grant_issue",
  "grant_revoke",
  "timelock_set",
  "budget_set",
  "execution_cancel",
  "agent_archive",
  "agent_restore",
  "agent_delete",
  "approval_vote",
  "signing_artifact_read",
  "signing_artifact_ack",
]);
export type IntentType = z.infer<typeof intentTypeSchema>;

export const signingStandardSchema = z.enum(["nep413", "nep366", "eip712", "webauthn"]);
export type SigningStandard = z.infer<typeof signingStandardSchema>;

// ---------------------------------------------------------------------------------------------
// Payloads, one per signing standard. Each is exactly what the wallet API takes.
// ---------------------------------------------------------------------------------------------

/** NEAR NEP-413 message. near-connect: `wallet.signMessage({ message, recipient, nonce })`. */
export const nep413PayloadSchema = z.strictObject({
  message: z.string(),
  recipient: z.string(),
  /** Base64 of the 32 nonce bytes. Decode to a `Uint8Array` before calling the wallet. */
  nonce: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
});

/**
 * NEAR NEP-366 delegate action, in near-connect's `ConnectorAction` shape.
 * near-connect: `wallet.signDelegateActions({ delegateActions: [payload] })`. The wallet picks
 * its own access-key nonce and block height. Function-call `args` are serialized with
 * `JSON.stringify`.
 */
export const nep366PayloadSchema = z.strictObject({
  receiverId: nearAccountSchema,
  actions: z
    .array(
      z.strictObject({
        type: z.literal("FunctionCall"),
        params: z.strictObject({
          methodName: z.string().min(1).max(128),
          args: z.record(z.string(), z.unknown()),
          gas: z.string().regex(/^[0-9]+$/),
          deposit: z.string().regex(/^[0-9]+$/),
        }),
      }),
    )
    .min(1)
    .max(2),
});

/** EIP-712 typed data. viem: `walletClient.signTypedData({ account, ...payload })`. */
export const eip712PayloadSchema = z.strictObject({
  domain: z.record(z.string(), z.unknown()),
  types: z.record(z.string(), z.array(z.strictObject({ name: z.string(), type: z.string() }))),
  primaryType: z.string(),
  message: z.record(z.string(), z.unknown()),
});

/**
 * WebAuthn `PublicKeyCredentialRequestOptionsJSON`.
 * `startAuthentication({ optionsJSON: payload })` or `navigator.credentials.get`.
 */
export const webauthnPayloadSchema = z.strictObject({
  challenge: z.string().regex(/^[A-Za-z0-9_-]+$/),
  rpId: z.string().min(1).max(253),
  allowCredentials: z
    .array(z.strictObject({ id: z.string(), type: z.literal("public-key") }))
    .length(1),
  userVerification: z.literal("required"),
  timeout: z.number().int().positive(),
});

export const intentSchema = z.discriminatedUnion("standard", [
  z.strictObject({ standard: z.literal("nep413"), payload: nep413PayloadSchema }),
  z.strictObject({ standard: z.literal("nep366"), payload: nep366PayloadSchema }),
  z.strictObject({ standard: z.literal("eip712"), payload: eip712PayloadSchema }),
  z.strictObject({ standard: z.literal("webauthn"), payload: webauthnPayloadSchema }),
]);
export type Intent = z.infer<typeof intentSchema>;
export type IntentOf<S extends SigningStandard> = Extract<Intent, { standard: S }>;

/**
 * The wallet's output, sent back unchanged with the payload it signed. The server compares the
 * payload with the stored intent byte for byte and accepts any common signature encoding.
 */
export const signedDataSchema = z.discriminatedUnion("standard", [
  z.strictObject({
    standard: z.literal("nep413"),
    payload: nep413PayloadSchema,
    /** `ed25519:<base58>` public key the wallet signed with. */
    public_key: z.string().startsWith("ed25519:").max(80),
    /** Signature as the wallet returned it: base64, base58, `ed25519:<base58>` or hex. */
    signature: z.string().min(64).max(256),
  }),
  z.strictObject({
    standard: z.literal("nep366"),
    payload: nep366PayloadSchema,
    /** Base64 borsh `SignedDelegate`, e.g. `signedDelegateActions[0]` from near-connect. */
    signedDelegate: z.string().min(32).max(50_000),
  }),
  z.strictObject({
    standard: z.literal("eip712"),
    payload: eip712PayloadSchema,
    signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  }),
  z.strictObject({
    standard: z.literal("webauthn"),
    payload: webauthnPayloadSchema,
    /** The `AuthenticationResponseJSON` returned by the authenticator. */
    credential: authenticationResponseSchema,
  }),
]);
export type SignedData = z.infer<typeof signedDataSchema>;

// ---------------------------------------------------------------------------------------------
// generate-intent requests
// ---------------------------------------------------------------------------------------------

const agentScoped = { agentId: agentIdSchema };

export const generateIntentRequestSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("agent_create"),
    name: z.string().trim().min(1).max(100),
    externalUserId: z.string().min(1).max(200).optional(),
    owner: ownerWalletSchema,
    policy: policySchema,
  }),
  z.strictObject({
    type: z.literal("policy_update"),
    ...agentScoped,
    policy: policySchema,
    /** Current applied revision from `GET /agents/{agentId}/policy`. */
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.strictObject({ type: z.literal("agent_freeze"), ...agentScoped }),
  z.strictObject({ type: z.literal("agent_unfreeze"), ...agentScoped }),
  z.strictObject({
    type: z.literal("grant_issue"),
    ...agentScoped,
    /** Shown to the owner when signing and on every operation this grant authorizes. */
    label: grantLabelSchema,
    /**
     * SHA-256 hex of the grant token that will use this grant (`createGrantCredential()` in the
     * SDK). Keep the token itself on your backend; it is never sent here.
     */
    credential: grantCommitmentSchema,
    /** Execution actions (`swap`, `withdraw`, …), `*`, or `sign:near_message` / `sign:evm_message`. */
    actions: z.array(z.string().min(1).max(64)).min(1).max(64),
    /** Allowed destinations, refund addresses included. Empty keeps the grant to the agent's own balances. */
    recipients: z.array(grantDestinationSchema).max(256).default([]),
    signingAudiences: z.array(z.string().min(1).max(256)).max(256).default([]),
    /** When the delegation ends. At most 90 days ahead. */
    expiresAt: z.iso.datetime(),
  }),
  z.strictObject({
    type: z.literal("grant_revoke"),
    ...agentScoped,
    grantId: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.strictObject({
    type: z.literal("timelock_set"),
    ...agentScoped,
    /** Delay applied to every execution; 0 disables. At most 30 days. */
    delaySeconds: z
      .number()
      .int()
      .min(0)
      .max(30 * 24 * 60 * 60),
  }),
  z.strictObject({
    type: z.literal("budget_set"),
    ...agentScoped,
    /**
     * USD spend caps over rolling 24 hours, 7 days and 30 days, counted across every asset. Send
     * any subset; an omitted or null window is uncapped. This replaces the previous caps.
     */
    dailyUsd: usdAmountSchema.nullable().default(null),
    weeklyUsd: usdAmountSchema.nullable().default(null),
    monthlyUsd: usdAmountSchema.nullable().default(null),
  }),
  z.strictObject({
    type: z.literal("execution_cancel"),
    ...agentScoped,
    /** Correlation id of a `QUEUED` execution. */
    correlationId: correlationIdSchema,
  }),
  z.strictObject({ type: z.literal("agent_archive"), ...agentScoped }),
  z.strictObject({ type: z.literal("agent_restore"), ...agentScoped }),
  z.strictObject({ type: z.literal("agent_delete"), ...agentScoped }),
  z.strictObject({
    type: z.literal("approval_vote"),
    ...agentScoped,
    approvalId: z.uuid(),
    verdict: z.enum(["approve", "reject"]),
    /**
     * NEAR approver listed in the applied policy. Defaults to the agent's owner, which must then
     * be a NEAR account.
     */
    signer: z
      .strictObject({
        accountId: nearAccountSchema,
        publicKey: z.string().startsWith("ed25519:").max(80),
      })
      .optional(),
  }),
  z.strictObject({
    type: z.literal("signing_artifact_read"),
    ...agentScoped,
    correlationId: correlationIdSchema,
  }),
  z.strictObject({
    type: z.literal("signing_artifact_ack"),
    ...agentScoped,
    correlationId: correlationIdSchema,
  }),
]);
export type GenerateIntentRequest = z.input<typeof generateIntentRequestSchema>;
export type GenerateIntentRequestOf<T extends IntentType> = Extract<
  GenerateIntentRequest,
  { type: T }
>;

/** What the owner is about to authorize, for display next to the wallet prompt. */
export const intentPreviewSchema = z.strictObject({
  summary: z.string(),
  revision: z.number().int().nonnegative().optional(),
  previousRevision: z.number().int().nonnegative().optional(),
  policyHash: z.string().optional(),
  deletion: deletionPreviewSchema.optional(),
  approval: z
    .strictObject({
      approvalId: z.uuid(),
      requestType: z.string(),
      requestHash: z.string(),
      verdict: z.enum(["approve", "reject"]),
    })
    .optional(),
});
export type IntentPreview = z.infer<typeof intentPreviewSchema>;

export const generateIntentResponseSchema = z.strictObject({
  correlationId: correlationIdSchema,
  type: intentTypeSchema,
  agentId: agentIdSchema,
  status: z.literal("PENDING_SIGNATURE"),
  /** Submit the signature before this instant. */
  expiresAt: z.iso.datetime(),
  /** The identity whose wallet must sign. */
  signer: ownerWalletSchema,
  intent: intentSchema,
  preview: intentPreviewSchema,
});
export type GenerateIntentResponse = z.infer<typeof generateIntentResponseSchema>;
/** Policy requests use NEP-366 for NEAR; consent requests use NEP-413. */
export type GenerateIntentResponseOf<T extends IntentType> = T extends IntentType
  ? Omit<GenerateIntentResponse, "type" | "intent"> & {
      type: T;
      intent: Extract<
        Intent,
        {
          standard:
            | "eip712"
            | "webauthn"
            | (T extends "agent_create" | "policy_update" | "agent_freeze" | "agent_unfreeze"
                ? "nep366"
                : "nep413");
        }
      >;
    }
  : never;

// ---------------------------------------------------------------------------------------------
// submit-intent
// ---------------------------------------------------------------------------------------------

export const submitIntentRequestSchema = z.strictObject({
  type: intentTypeSchema,
  correlationId: correlationIdSchema,
  signedData: signedDataSchema,
});
export type SubmitIntentRequest = z.infer<typeof submitIntentRequestSchema>;
