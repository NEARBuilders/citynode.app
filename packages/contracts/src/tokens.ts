import { z } from "zod";
import { atomicAmountSchema } from "./api/common.js";

/** One asset agents can use; the shape follows the 1Click token list. */
export const tokenViewSchema = z.strictObject({
  /** NEAR Intents asset id. Pass it as `asset`, `originAsset` or `destinationAsset`. */
  assetId: z.string().min(1).max(256),
  symbol: z.string().min(1).max(64),
  decimals: z.number().int().nonnegative().max(36),
  /** Chain the asset originates on (`near`, `eth`, `sol`, …). */
  blockchain: z.string().min(1).max(64),
  /**
   * USD per whole token from the 1Click feed; null when it has no usable price (none, too old, or
   * in different decimals than custody). Null is unknown, never zero.
   */
  price: z.number().nonnegative().nullable(),
  /** When 1Click last updated the quote, even one too old to use. */
  priceUpdatedAt: z.string().nullable(),
  /** When `price` stops being usable; null with no price. Do not show `price` after it. */
  priceExpiresAt: z.string().nullable(),
});

/** Held assets retain their identity even when catalog metadata is unavailable. */
export const balanceEntrySchema = tokenViewSchema.extend({
  symbol: tokenViewSchema.shape.symbol.nullable(),
  decimals: tokenViewSchema.shape.decimals.nullable(),
  blockchain: tokenViewSchema.shape.blockchain.nullable(),
  balanceRaw: atomicAmountSchema,
  balance: z
    .string()
    .regex(/^(0|[1-9][0-9]*)(\.[0-9]+)?$/)
    .nullable()
    .describe("Exact token units, or null when decimals are unknown."),
});
