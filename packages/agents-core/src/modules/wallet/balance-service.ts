import {
  type BalanceList,
  type BalanceListQuery,
  type Wallet,
  walletSchema,
} from "@near-intents-agent-api/contracts";
import { getOutlayer } from "../../lib/outlayer.js";
import { getTokenCatalog } from "../../lib/token-catalog.js";
import type { Actor } from "../../shared/actor.js";
import { ApiError } from "../../shared/errors.js";
import { nearProvider } from "../../shared/near.js";
import { requireBoundAgent } from "../agents/service.js";
import { enrichBalance } from "./balance-utils.js";
import { custodyCredential, toWallet } from "./service.js";

/** Native NEAR held by the custody account itself; only the deletion preview reads it. */
export async function custodyNativeBalance(actor: Actor, id: string): Promise<string> {
  const { wallet } = await requireBoundAgent(actor, id);
  const result = await getOutlayer().balance(custodyCredential(wallet), { chain: "near" });
  return result.balance;
}

/** Native NEAR inside NEAR Intents is addressed as `nep141:native` by the provider. */
const NATIVE_INTENTS_TOKEN = "nep141:native";

/**
 * Multi-asset balances for the public and confidential sources. Public holds NEAR-native value
 * under `nep141:native` plus every catalog token; confidential balances are provider-only.
 * Only non-zero entries are returned so the list mirrors what the wallet actually holds.
 */
export async function balanceList(
  actor: Actor,
  id: string,
  query: BalanceListQuery,
): Promise<BalanceList> {
  const { wallet } = await requireBoundAgent(actor, id);
  const client = getOutlayer();
  const catalog = await getTokenCatalog().list();
  const catalogById = new Map(catalog.map((token) => [token.assetId, token]));
  if (query.source === "confidential") {
    const result = await client.confidentialBalance(custodyCredential(wallet));
    if (result.single) throw new ApiError("invalid_outlayer_response", 502);
    return {
      near_account_id: result.value.account_id,
      source: "confidential",
      balances: result.value.balances
        .filter((entry) => BigInt(entry.balance) > 0n)
        .map((entry) => enrichBalance(entry.token, entry.balance, catalogById, entry)),
    } satisfies BalanceList;
  }

  // The registry is the authority on what the wallet actually holds; the catalog supplies
  // symbol/decimals. Held tokens that left the catalog still appear, with null metadata.
  const held = await nearIntentsHeldTokens(wallet.nearAccountId);
  const tokenIds = [...new Set([NATIVE_INTENTS_TOKEN, ...catalogById.keys(), ...held])];
  // One batch call on intents.near replaces one provider read per catalog token, which would
  // otherwise fan out to hundreds of requests and trip the provider rate limit.
  const balances = await nearIntentsBalances(wallet.nearAccountId, tokenIds);
  return {
    near_account_id: wallet.nearAccountId,
    source: "public",
    balances: tokenIds
      .map((tokenId, index) => enrichBalance(tokenId, balances[index] ?? "0", catalogById))
      .filter((entry) => BigInt(entry.balanceRaw) > 0n),
  } satisfies BalanceList;
}

/** Tokens the wallet actually holds in intents.near, whether or not they remain in the catalog. */
async function nearIntentsHeldTokens(accountId: string): Promise<string[]> {
  const result = await nearProvider().callFunction<Array<{ token_id: string }>>({
    contractId: "intents.near",
    method: "mt_tokens_for_owner",
    args: { account_id: accountId },
    blockQuery: { finality: "final" },
  });
  if (!Array.isArray(result)) return [];
  return result
    .map((entry) =>
      entry && typeof entry === "object" && "token_id" in entry ? String(entry.token_id) : null,
    )
    .filter((tokenId): tokenId is string => typeof tokenId === "string" && tokenId.length > 0);
}

/** `mt_batch_balance_of` on intents.near returns one balance per requested token id, in order. */
async function nearIntentsBalances(accountId: string, tokenIds: string[]): Promise<string[]> {
  if (tokenIds.length === 0) return [];
  const result = await nearProvider().callFunction<string[]>({
    contractId: "intents.near",
    method: "mt_batch_balance_of",
    args: { account_id: accountId, token_ids: tokenIds },
    blockQuery: { finality: "final" },
  });
  if (!Array.isArray(result) || result.some((value) => typeof value !== "string"))
    throw new ApiError("invalid_intents_response", 502);
  return result;
}

export async function walletView(actor: Actor, id: string): Promise<Wallet> {
  const { wallet } = await requireBoundAgent(actor, id);
  return walletSchema.parse(toWallet(wallet));
}
