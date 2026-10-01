import { z } from "zod";

const text = z.string().min(1).max(256);
const amount = z.string().regex(/^[0-9]{1,78}$/);
const swap = z.strictObject({
  token_in: text,
  token_out: text,
  amount_in: amount,
  min_amount_out: amount.optional(),
  confidential: z.boolean().default(false),
});
const withdrawal = z.strictObject({
  token: text,
  amount,
  chain: text,
  to: text,
  memo: z.string().max(256).optional(),
  confidential: z.boolean().default(false),
});
const walletQuerySchema = z.discriminatedUnion("query", [
  z.strictObject({ query: z.literal("address"), chain: text }),
  z.strictObject({ query: z.literal("confidential_balances") }),
  z.strictObject({ query: z.literal("pending_approvals") }),
  z.strictObject({
    query: z.literal("requests"),
    limit: z.number().int().min(1).max(100).optional(),
    type: text.optional(),
  }),
  z.strictObject({ query: z.literal("audit") }),
  z.strictObject({
    query: z.literal("deposits"),
    limit: z.number().int().min(1).max(100).optional(),
  }),
  z.strictObject({ query: z.literal("deposit_status"), id: text }),
  z.strictObject({ query: z.literal("deposit_intent_status"), id: text }),
  z.strictObject({
    query: z.literal("deposit_history"),
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().nonnegative().max(10_000).optional(),
  }),
  z.strictObject({ query: z.literal("swap_quote"), request: swap }),
  z.strictObject({ query: z.literal("withdraw_preview"), request: withdrawal }),
]);
export type WalletQuery = z.input<typeof walletQuerySchema>;
export type WalletQueryResult = {
  query: WalletQuery["query"];
  data: Record<string, unknown> | unknown[];
};
