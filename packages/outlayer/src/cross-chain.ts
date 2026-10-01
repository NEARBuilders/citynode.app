import type { ProviderRequest } from "./types.js";

type CrossChainInput = {
  sourceAsset?: string;
  destinationAsset?: string;
  amount: string;
  chain?: string;
  token?: string;
  refundAddress?: string;
};

const crossChainBody = (input: CrossChainInput) => ({
  source_asset: input.sourceAsset,
  destination_asset: input.destinationAsset,
  amount: input.amount,
  chain: input.chain,
  token: input.token,
  refund_address: input.refundAddress,
});

/**
 * Cross-chain deposit routes do not deduplicate on `X-Idempotency-Key`, so they send none: the
 * transport retries only keyed mutations, and each of these creates a new deposit intent per POST.
 */
export function createCrossChainOperations(request: ProviderRequest) {
  const intents = (apiKey: string, input: CrossChainInput) =>
    request({
      apiKey,
      body: crossChainBody(input),
      method: "POST",
      path: "/wallet/v1/intents/deposit/cross-chain",
    });
  const confidential = (apiKey: string, input: Omit<CrossChainInput, "destinationAsset">) =>
    request({
      apiKey,
      body: crossChainBody(input),
      method: "POST",
      path: "/wallet/v1/confidential/deposit/cross-chain",
    });
  return {
    intentsDepositCrossChain: intents,
    confidentialDepositCrossChain: confidential,
    intentsDepositIntent: intents,
    confidentialDepositIntent: confidential,
  };
}
