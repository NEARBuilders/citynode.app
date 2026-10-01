import { z } from "zod";

export const idSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const nearAccountSchema = z.string().min(2).max(64);

export const nearPublicKeySchema = z
  .string()
  .regex(
    /^(?:ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}|p256:[1-9A-HJ-NP-Za-km-z]{43,46}|secp256k1:[1-9A-HJ-NP-Za-km-z]{80,90})$/,
  );

/** Owner authentication is separate from the derived NEAR identity and agent custody. */
const ownerTypeSchema = z.enum(["near", "evm", "passkey"]);
export const supportedOwnerTypes = ownerTypeSchema.options;
const base64url = z.string().regex(/^[A-Za-z0-9_-]+$/);
const nearOwnerWalletSchema = z.strictObject({
  type: z.literal("near"),
  accountId: nearAccountSchema,
  publicKey: z.string().regex(/^ed25519:[1-9A-HJ-NP-Za-km-z]{32,44}$/),
});
export const ownerWalletSchema = z.discriminatedUnion("type", [
  nearOwnerWalletSchema,
  z.strictObject({
    type: z.literal("evm"),
    address: z.string().regex(/^0x[0-9a-f]{40}$/),
    chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    publicKey: z.string().regex(/^0x[0-9a-f]{128}$/),
  }),
  z.strictObject({
    type: z.literal("passkey"),
    credentialId: base64url,
    publicKey: base64url,
    rpId: z.string().min(1).max(253),
    origin: z.string().url(),
  }),
]);
export const authenticationResponseSchema = z.object({
  id: base64url,
  rawId: base64url,
  type: z.literal("public-key"),
  response: z.object({
    clientDataJSON: base64url,
    authenticatorData: base64url,
    signature: base64url,
    userHandle: base64url.optional(),
  }),
  clientExtensionResults: z.record(z.string(), z.unknown()),
  authenticatorAttachment: z.enum(["platform", "cross-platform"]).optional(),
});
export const ownerProofSchema = z.union([
  z.strictObject({
    signature: z
      .string()
      .regex(/^(?:[0-9a-f]{128}|0x[0-9a-fA-F]{130}|[1-9A-HJ-NP-Za-km-z]{64,88})$/),
  }),
  z.strictObject({ authentication: authenticationResponseSchema }),
  z.strictObject({ walletAuthorization: z.string().min(1).max(32_768) }),
]);
export const ownerNearSchema = z.strictObject({
  accountId: nearAccountSchema,
  publicKey: nearPublicKeySchema,
  authority: z.literal("wallet"),
});
export const ownerSigningRequestSchema = z.strictObject({
  owner: ownerWalletSchema,
  message: z.string(),
  nonce: idSchema,
  recipient: z.string(),
  challenge: base64url,
});

/**
 * The header every owner-signed consent envelope carries.
 *
 * An owner signs canonical JSON, and the verifier re-derives the same set from server state, so
 * these ten bindings must mean the same thing in every ceremony: which owner consented, to which
 * tenant/agent, on which network, over which custody account and key, delivered to which
 * recipient, with which single-use nonce, inside which freshness window. Declaring them once keeps
 * a rule change (a wider network set, a longer window) from silently applying to only some
 * ceremonies.
 *
 * `agentGrantMessageSchema` deliberately does not use this: a grant is a longer-lived delegation
 * with its own nonce and recipient constraints.
 */
export const signedMessageFields = {
  owner: ownerWalletSchema,
  tenant_id: idSchema,
  agent_id: idSchema,
  network: z.literal("mainnet"),
  account_id: nearAccountSchema,
  public_key: nearPublicKeySchema,
  recipient: z.string().min(1).max(253),
  nonce: idSchema,
  issued_at_ms: z.number().int().nonnegative(),
  expires_at_ms: z.number().int().positive(),
};
export type OwnerSigningRequest = z.infer<typeof ownerSigningRequestSchema>;
export type OwnerNear = z.infer<typeof ownerNearSchema>;
export type NearOwnerWallet = z.infer<typeof nearOwnerWalletSchema>;
export type OwnerWallet = z.infer<typeof ownerWalletSchema>;
export type OwnerType = z.infer<typeof ownerTypeSchema>;
export type OwnerProof = z.infer<typeof ownerProofSchema>;

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Value is not JSON");
  return result;
}

/** A USD amount with at most two decimals, e.g. `200` or `1000.50`. */
export const usdAmountSchema = z.string().regex(/^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$/);
