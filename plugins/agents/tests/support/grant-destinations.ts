import { canonicalDestination, type GrantDestination } from "@near-intents-agent-api/contracts";
/** Explicit fixture permissions. Production never infers scope from an address. */
export function testDestinations(addresses: readonly string[]): GrantDestination[] {
  return addresses
    .filter((address) => !address.startsWith("https://"))
    .flatMap((address): GrantDestination[] => {
      const chains = fixtureChains(address);
      const destinations: GrantDestination[] = [];
      for (const chain of chains) destinations.push(...chainDestinations(chain, address));
      if (chains[0] === "near")
        for (const action of ["intents_transfer", "confidential_transfer"] as const)
          destinations.push({
            action,
            kind: action === "intents_transfer" ? "intents-account" : "confidential-account",
            chain: "near",
            network: "mainnet",
            address,
            memo: { kind: "none" },
            purpose: "payout",
          });
      return destinations;
    });
}

function chainDestinations(chain: string, address: string): GrantDestination[] {
  return (["withdraw", "cross_chain_deposit"] as const).map((action) =>
    canonicalDestination({
      action,
      kind: "chain-address",
      chain,
      network: "mainnet",
      address,
      memo: { kind: "none" },
      purpose: action === "withdraw" ? "payout" : "refund",
    }),
  );
}

/**
 * The chains a fixture address belongs to, by its full format. A prefix test is not enough: an
 * implicit NEAR account is 64 hex characters and starts with `1` or `3` one time in eight.
 */
function fixtureChains(address: string) {
  if (address.startsWith("0x")) return ["base", "eth"];
  const bitcoin = /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;
  return bitcoin.test(address) ? ["btc"] : ["near"];
}
