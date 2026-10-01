import { z } from "zod";

const amountSchema = z.string().regex(/^[0-9]{1,78}$/);

export const registerResponseSchema = z
  .object({
    api_key: z.string().min(1),
    handoff_url: z.string().min(1).optional(),
    near_account_id: z.string().regex(/^[0-9a-f]{64}$/),
    wallet_id: z.string().min(1).max(256),
  })
  .passthrough();

export const addressResponseSchema = z
  .object({
    address: z.string().min(1).max(256),
    chain: z.string().min(1).max(64).optional(),
  })
  .passthrough();

export const balanceResponseSchema = z
  .object({
    account_id: z.string().min(2).max(64),
    balance: amountSchema,
    token: z.string().min(1).max(128).nullable().optional(),
    source: z.enum(["chain", "intents"]).optional(),
  })
  .passthrough();

export const tokenSchema = z
  .object({
    id: z.string().min(1).max(256),
    symbol: z.string().min(1).max(64),
    chains: z.array(z.string().min(1).max(64)).max(32),
    decimals: z.number().int().nonnegative().max(36),
    defuse_asset_id: z.string().min(1).max(256).optional(),
  })
  .passthrough();

export const tokensResponseSchema = z
  .object({ tokens: z.array(tokenSchema).max(4096) })
  .passthrough();

/** One entry of the provider's confidential balance list (`?token` omitted). */
export const confidentialBalanceEntrySchema = z
  .object({
    token: z.string().min(1).max(256),
    balance: amountSchema,
    decimals: z.number().int().nonnegative().max(36).optional(),
    symbol: z.string().min(1).max(64).optional(),
  })
  .passthrough();

export const confidentialBalancesResponseSchema = z
  .object({
    account_id: z.string().min(2).max(64),
    balances: z.array(confidentialBalanceEntrySchema).max(4096),
  })
  .passthrough();

export const encryptPolicyResponseSchema = z
  .object({ encrypted_base64: z.string().min(1).max(262_144) })
  .passthrough();

export const signPolicyResponseSchema = z
  .object({
    public_key_hex: z.string().regex(/^[0-9a-f]{64}$/),
    signature_hex: z.string().regex(/^[0-9a-f]{128}$/),
  })
  .passthrough();

export const providerResponseSchema = z.object({}).catchall(z.unknown());

export const signatureResponseSchema = z
  .object({
    address: z.string().min(1).max(256).optional(),
    public_key: z.string().min(1).max(128).optional(),
    signature: z.string().min(1).max(512).optional(),
  })
  .catchall(z.unknown());

export const chainSchema = z.enum([
  "near",
  "ethereum",
  "base",
  "arbitrum",
  "bitcoin",
  "bsc",
  "polygon",
  "optimism",
  "avalanche",
]);

export type OutlayerRegisterResult = z.infer<typeof registerResponseSchema>;
export type OutlayerAddressResult = z.infer<typeof addressResponseSchema>;
export type OutlayerBalanceResult = z.infer<typeof balanceResponseSchema>;
export type OutlayerToken = z.infer<typeof tokenSchema>;
export type OutlayerTokensResult = z.infer<typeof tokensResponseSchema>;
export type OutlayerConfidentialBalanceEntry = z.infer<typeof confidentialBalanceEntrySchema>;
export type OutlayerConfidentialBalancesResult = z.infer<typeof confidentialBalancesResponseSchema>;
export type OutlayerEncryptPolicyResult = z.infer<typeof encryptPolicyResponseSchema>;
export type OutlayerSignPolicyResult = z.infer<typeof signPolicyResponseSchema>;
export type OutlayerProviderResponse = z.infer<typeof providerResponseSchema>;
export type OutlayerSignatureResponse = z.infer<typeof signatureResponseSchema>;
export type OutlayerChain = z.infer<typeof chainSchema>;
