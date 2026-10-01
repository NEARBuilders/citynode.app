import type { ProviderRequest } from "./types.js";

export function createFundOperations(request: ProviderRequest) {
  return {
    intentsSwap(
      apiKey: string,
      input: { amountIn: string; minAmountOut?: string; tokenIn: string; tokenOut: string },
      idempotencyKey?: string,
    ) {
      return request({
        apiKey,
        idempotencyKey,
        body: {
          amount_in: input.amountIn,
          min_amount_out: input.minAmountOut,
          token_in: input.tokenIn,
          token_out: input.tokenOut,
        },
        method: "POST",
        path: "/wallet/v1/intents/swap",
      });
    },

    intentsWithdraw(
      apiKey: string,
      input: {
        amount: string;
        chain: string;
        memo?: string;
        token: string;
        to: string;
        async?: boolean;
      },
      idempotencyKey?: string,
    ) {
      return request({
        apiKey,
        idempotencyKey,
        body: input,
        method: "POST",
        path: "/wallet/v1/intents/withdraw",
      });
    },

    confidentialSwap(
      apiKey: string,
      input: { amountIn: string; minAmountOut?: string; tokenIn: string; tokenOut: string },
      idempotencyKey?: string,
    ) {
      return request({
        apiKey,
        idempotencyKey,
        body: {
          amount_in: input.amountIn,
          min_amount_out: input.minAmountOut,
          token_in: input.tokenIn,
          token_out: input.tokenOut,
        },
        method: "POST",
        path: "/wallet/v1/confidential/swap",
      });
    },

    confidentialWithdraw(
      apiKey: string,
      input: {
        amount: string;
        chain: string;
        memo?: string;
        token: string;
        to: string;
        async?: boolean;
      },
      idempotencyKey?: string,
    ) {
      return request({
        apiKey,
        idempotencyKey,
        body: input,
        method: "POST",
        path: "/wallet/v1/confidential/withdraw",
      });
    },

    confidentialShield(
      apiKey: string,
      input: { amount: string; token: string },
      idempotencyKey?: string,
    ) {
      return request({
        apiKey,
        idempotencyKey,
        body: input,
        method: "POST",
        path: "/wallet/v1/confidential/shield",
      });
    },

    confidentialUnshield(
      apiKey: string,
      input: { amount: string; token: string },
      idempotencyKey?: string,
    ) {
      return request({
        apiKey,
        idempotencyKey,
        body: input,
        method: "POST",
        path: "/wallet/v1/confidential/unshield",
      });
    },

    deleteWallet(
      apiKey: string,
      input: { beneficiary: string; chain?: "near" },
      idempotencyKey?: string,
    ) {
      return request({
        apiKey,
        idempotencyKey,
        body: { beneficiary: input.beneficiary, chain: input.chain ?? "near" },
        method: "POST",
        path: "/wallet/v1/delete",
      });
    },

    walletExecution(
      kind: "intents/transfer" | "confidential/transfer" | "confidential/deposit",
      apiKey: string,
      body: unknown,
      idempotencyKey: string,
    ) {
      return request({
        apiKey,
        body,
        idempotencyKey,
        method: "POST",
        path: `/wallet/v1/${kind}`,
      });
    },
  };
}
