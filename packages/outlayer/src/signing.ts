import { providerResponseSchema, signatureResponseSchema } from "./schemas.js";
import type { OutlayerChain, ProviderRequest } from "./types.js";

export function createSigningOperations(request: ProviderRequest) {
  return {
    async signNearMessage(
      apiKey: string,
      input: { message: string; recipient: string; nonce?: string },
    ) {
      return signatureResponseSchema.parse(
        await request({
          apiKey,
          body: { message: input.message, nonce: input.nonce, recipient: input.recipient },
          method: "POST",
          path: "/wallet/v1/sign-message",
        }),
      );
    },

    async signEvmMessage(
      apiKey: string,
      input: { message: string; encoding?: "utf8" | "hex"; chain: OutlayerChain },
    ) {
      return signatureResponseSchema.parse(
        await request({
          apiKey,
          body: {
            chain: input.chain ?? "ethereum",
            encoding: input.encoding,
            message: input.message,
          },
          method: "POST",
          path: "/wallet/v1/evm/sign-message",
        }),
      );
    },

    async signEvmTypedData(
      apiKey: string,
      input: { chain: OutlayerChain; typedData: Record<string, unknown> },
    ) {
      return providerResponseSchema.parse(
        await request({
          apiKey,
          body: { chain: input.chain, typed_data: input.typedData },
          method: "POST",
          path: "/wallet/v1/evm/sign-typed-data",
        }),
      );
    },

    async signEvmTransaction(apiKey: string, input: { chain: OutlayerChain; unsignedTx: string }) {
      return providerResponseSchema.parse(
        await request({
          apiKey,
          body: { chain: input.chain, unsigned_tx: input.unsignedTx },
          method: "POST",
          path: "/wallet/v1/evm/sign-transaction",
        }),
      );
    },
  };
}
