import type { WalletQuery, WalletQueryResult } from "@near-intents-agent-api/contracts";
import { getOutlayer } from "../../lib/outlayer.js";
import type { Actor } from "../../shared/actor.js";
import { requireBoundAgent } from "../agents/service.js";
import { projectWalletQueryData } from "./query-projection.js";
import { custodyCredential } from "./service.js";

export async function queryWallet(
  actor: Actor,
  agentId: string,
  input: WalletQuery,
): Promise<WalletQueryResult> {
  const result = await queryWalletRaw(actor, agentId, input);
  return { ...result, data: projectWalletQueryData(result.data) };
}

async function queryWalletRaw(
  actor: Actor,
  agentId: string,
  input: WalletQuery,
): Promise<WalletQueryResult> {
  const { wallet } = await requireBoundAgent(actor, agentId);
  const credential = custodyCredential(wallet);
  const provider = getOutlayer();
  const query = input.query;
  switch (input.query) {
    case "swap_quote": {
      const { confidential, ...body } = input.request;
      return {
        query,
        data: await provider.walletQuote(
          confidential ? "confidential/swap/quote" : "intents/swap/quote",
          credential,
          body,
        ),
      };
    }
    case "withdraw_preview": {
      const { confidential, ...body } = input.request;
      return {
        query,
        data: await provider.walletQuote(
          confidential ? "confidential/withdraw/dry-run" : "intents/withdraw/dry-run",
          credential,
          body,
        ),
      };
    }
    case "address":
      return {
        query,
        data: await provider.walletRead(
          { path: "address", params: { chain: input.chain } },
          credential,
        ),
      };
    case "requests":
      return {
        query,
        data: await provider.walletRead(
          { path: "requests", params: { limit: input.limit, type: input.type } },
          credential,
        ),
      };
    case "deposits":
      return {
        query,
        data: await provider.walletRead(
          { path: "intents/deposit/cross-chain/list", params: { limit: input.limit } },
          credential,
        ),
      };
    case "deposit_status":
      return {
        query,
        data: await provider.walletRead(
          { path: "intents/deposit/cross-chain/status", params: { id: input.id } },
          credential,
        ),
      };
    case "deposit_intent_status":
      return { query, data: await provider.depositIntentStatus(credential, input.id) };
    case "deposit_history":
      return {
        query,
        data: await provider.depositHistory(credential, {
          limit: input.limit,
          offset: input.offset,
        }),
      };
    default: {
      const paths = {
        confidential_balances: "confidential/balance",
        pending_approvals: "pending_approvals",
        audit: "audit",
      } as const;
      return { query, data: await provider.walletRead({ path: paths[input.query] }, credential) };
    }
  }
}
