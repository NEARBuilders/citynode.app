import { createCrossChainOperations } from "./cross-chain.js";
import { createFundOperations } from "./funds.js";
import { createQueryOperations } from "./query.js";
import { createSigningOperations } from "./signing.js";
import { createOutlayerTransport } from "./transport.js";
import type { OutlayerClientOptions } from "./types.js";
import { outlayerNetworks } from "./types.js";
import { createWalletOperations } from "./wallet.js";

export function createOutlayerClient(options: OutlayerClientOptions = {}) {
  const request = createOutlayerTransport(options);
  return {
    network: "mainnet" as const,
    contractId: outlayerNetworks.mainnet.contractId,
    ...createWalletOperations(request),
    ...createSigningOperations(request),
    ...createFundOperations(request),
    ...createCrossChainOperations(request),
    ...createQueryOperations(request),
  };
}

export type OutlayerWalletClient = ReturnType<typeof createOutlayerClient>;
