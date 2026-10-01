import type {
  OutlayerAddressResult,
  OutlayerBalanceResult,
  OutlayerEncryptPolicyResult,
  OutlayerRegisterResult,
  OutlayerSignPolicyResult,
} from "./schemas.js";
import {
  addressResponseSchema,
  balanceResponseSchema,
  encryptPolicyResponseSchema,
  providerResponseSchema,
  registerResponseSchema,
  signPolicyResponseSchema,
} from "./schemas.js";
import type { OutlayerPolicyDocument, ProviderRequest } from "./types.js";

export function createWalletOperations(request: ProviderRequest) {
  return {
    async registerWallet(): Promise<OutlayerRegisterResult> {
      return registerResponseSchema.parse(
        await request({ apiKey: "", body: {}, method: "POST", path: "/register" }),
      );
    },

    async address(apiKey: string, chain = "near"): Promise<OutlayerAddressResult> {
      return addressResponseSchema.parse(
        await request({
          apiKey,
          method: "GET",
          path: "/wallet/v1/address",
          query: { chain },
        }),
      );
    },

    async balance(
      apiKey: string,
      params: { chain?: string; source?: "chain" | "intents"; token?: string } = {},
    ): Promise<OutlayerBalanceResult> {
      return balanceResponseSchema.parse(
        await request({
          apiKey,
          method: "GET",
          path: "/wallet/v1/balance",
          query: {
            chain: params.chain ?? "near",
            source: params.source ?? "chain",
            token: params.token,
          },
        }),
      );
    },

    async policy(apiKey: string) {
      return providerResponseSchema.parse(
        await request({ apiKey, method: "GET", path: "/wallet/v1/policy" }),
      );
    },

    async encryptPolicy(
      apiKey: string,
      policy: OutlayerPolicyDocument,
      walletId: string,
    ): Promise<OutlayerEncryptPolicyResult> {
      return encryptPolicyResponseSchema.parse(
        await request({
          apiKey,
          body: { ...policy, wallet_id: walletId },
          method: "POST",
          path: "/wallet/v1/encrypt-policy",
        }),
      );
    },

    async signPolicy(
      apiKey: string,
      input: { caller: string; encryptedData: string },
    ): Promise<OutlayerSignPolicyResult> {
      return signPolicyResponseSchema.parse(
        await request({
          apiKey,
          body: { caller: input.caller, encrypted_data: input.encryptedData },
          method: "POST",
          path: "/wallet/v1/sign-policy",
        }),
      );
    },

    invalidatePolicyCache(apiKey: string, input: { walletId?: string } = {}) {
      return request({
        apiKey,
        body: { wallet_id: input.walletId },
        method: "POST",
        path: "/wallet/v1/invalidate-cache",
      });
    },
  };
}
