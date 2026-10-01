import { z } from "zod";
import {
  balanceResponseSchema,
  confidentialBalancesResponseSchema,
  providerResponseSchema,
  tokensResponseSchema,
} from "./schemas.js";
import type { ProviderRequest } from "./types.js";

export function createQueryOperations(request: ProviderRequest) {
  return {
    depositIntentStatus(apiKey: string, id: string) {
      return request({
        apiKey,
        method: "GET",
        path: "/wallet/v1/intents/deposit/cross-chain/status",
        query: { id },
      }).then((value) => providerResponseSchema.parse(value));
    },

    depositHistory(apiKey: string, input: { limit?: number; offset?: number } = {}) {
      return request({
        apiKey,
        method: "GET",
        path: "/wallet/v1/intents/deposit/cross-chain/list",
        query: input,
      }).then((value) => z.union([providerResponseSchema, z.array(z.unknown())]).parse(value));
    },

    /** Single confidential asset when `token` is given, the full list otherwise. */
    async confidentialBalance(apiKey: string, token?: string) {
      const value = await request({
        apiKey,
        method: "GET",
        path: "/wallet/v1/confidential/balance",
        query: { token },
      });
      if (token) return { single: true as const, value: balanceResponseSchema.parse(value) };
      return { single: false as const, value: confidentialBalancesResponseSchema.parse(value) };
    },

    pendingApprovals(apiKey: string) {
      return request({ apiKey, method: "GET", path: "/wallet/v1/pending_approvals" });
    },

    approval(apiKey: string, id: string) {
      return request({
        apiKey,
        method: "GET",
        path: `/wallet/v1/approval/${encodeURIComponent(id)}`,
      });
    },

    vote(
      apiKey: string,
      id: string,
      verdict: "approve" | "reject",
      proof: { account_id: string; public_key: string; signature: string; nonce: string },
    ) {
      return request({
        apiKey,
        body: proof,
        method: "POST",
        path: `/wallet/v1/${verdict}/${encodeURIComponent(id)}`,
      });
    },

    /**
     * Supported Intents token catalog: the assets the provider can route swaps and cross-chain
     * withdraws through. Typed rather than passed through, because callers index it by token id
     * and read symbol/decimals for display.
     */
    async tokens(apiKey: string) {
      return tokensResponseSchema.parse(
        await request({ apiKey, method: "GET", path: "/wallet/v1/tokens" }),
      );
    },

    walletRead(
      query: {
        path:
          | "address"
          | "confidential/balance"
          | "pending_approvals"
          | "requests"
          | "audit"
          | "intents/deposit/cross-chain/list"
          | "intents/deposit/cross-chain/status";
        params?: Record<string, string | number | undefined>;
      },
      apiKey: string,
    ) {
      return request({
        apiKey,
        method: "GET",
        path: `/wallet/v1/${query.path}`,
        query: query.params,
      }).then((value) => z.union([providerResponseSchema, z.array(z.unknown())]).parse(value));
    },

    walletQuote(
      kind:
        | "intents/swap/quote"
        | "confidential/swap/quote"
        | "intents/withdraw/dry-run"
        | "confidential/withdraw/dry-run",
      apiKey: string,
      body: unknown,
    ) {
      return request({ apiKey, method: "POST", path: `/wallet/v1/${kind}`, body }).then((value) =>
        providerResponseSchema.parse(value),
      );
    },

    requestStatus(apiKey: string, requestId: string) {
      return request({
        apiKey,
        method: "GET",
        path: `/wallet/v1/requests/${encodeURIComponent(requestId)}`,
      });
    },
  };
}
