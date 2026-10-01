import { z } from "zod";

const chainAliases: Record<string, string> = {
  ethereum: "eth",
  arbitrum: "arb",
  polygon: "pol",
  matic: "pol",
  optimism: "op",
  avalanche: "avax",
  solana: "sol",
  bitcoin: "btc",
};
export const canonicalChain = (chain: string) => chainAliases[chain] ?? chain;
const evmChains = new Set(["eth", "base", "arb", "bsc", "pol", "op", "avax"]);

/** Complete external effect identity. No wildcard chains, tags or purposes. */
export const grantDestinationSchema = z
  .strictObject({
    action: z.enum([
      "withdraw",
      "intents_transfer",
      "confidential_transfer",
      "cross_chain_deposit",
    ]),
    kind: z.enum(["chain-address", "intents-account", "confidential-account"]),
    chain: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    network: z.literal("mainnet"),
    address: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => value === value.trim(), "Address whitespace is not allowed"),
    memo: z.union([
      z.strictObject({ kind: z.literal("none") }),
      z.strictObject({ kind: z.literal("exact"), value: z.string().max(256) }),
    ]),
    purpose: z.enum(["payout", "refund"]),
  })
  .superRefine((value, ctx) => {
    if (canonicalChain(value.chain) !== value.chain)
      ctx.addIssue({ code: "custom", message: "Use the canonical chain identifier" });
    const expected =
      value.action === "intents_transfer"
        ? "intents-account"
        : value.action === "confidential_transfer"
          ? "confidential-account"
          : "chain-address";
    if (
      value.kind !== expected ||
      value.purpose !== (value.action === "cross_chain_deposit" ? "refund" : "payout")
    )
      ctx.addIssue({
        code: "custom",
        message: "Destination kind and purpose must match its action",
      });
    if (
      value.kind !== "chain-address" &&
      (value.chain !== "near" || value.memo.kind !== "none" || value.purpose !== "payout")
    )
      ctx.addIssue({
        code: "custom",
        message: "Intents accounts require near, no memo and payout purpose",
      });
    if (
      value.kind === "chain-address" &&
      evmChains.has(value.chain) &&
      !/^0x[0-9a-f]{40}$/.test(value.address)
    )
      ctx.addIssue({
        code: "custom",
        message: "EVM destinations must use canonical lowercase hex addresses",
      });
  });
export type GrantDestination = z.infer<typeof grantDestinationSchema>;

/** Exact identity for non-EVM formats; never lowercase a case-sensitive address or alter a memo. */
export function canonicalDestination(input: GrantDestination): GrantDestination {
  const address =
    input.kind === "chain-address" && evmChains.has(canonicalChain(input.chain))
      ? input.address.toLowerCase()
      : input.address;
  return grantDestinationSchema.parse({ ...input, chain: canonicalChain(input.chain), address });
}
export function destinationLabel(value: GrantDestination): string {
  return `${value.purpose}: ${value.kind} ${value.chain} ${value.address}${value.memo.kind === "exact" ? ` (memo: ${JSON.stringify(value.memo.value)})` : " (no memo)"}`;
}
