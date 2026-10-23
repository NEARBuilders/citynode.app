export type NearNetworkId = "mainnet" | "testnet";

const RPC_URLS: Record<NearNetworkId, string> = {
  mainnet: "https://rpc.mainnet.near.org",
  testnet: "https://rpc.testnet.near.org",
};

export function nearRpcUrl(network: NearNetworkId): string {
  return RPC_URLS[network];
}
