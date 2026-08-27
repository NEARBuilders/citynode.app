export type NearNetworkId = "mainnet" | "testnet";

export interface AuthRuntimeVariables {
  siwn?: {
    subAccount?: Partial<Record<NearNetworkId, { parentAccount?: string }>>;
  };
}

interface ResolveTenantIdentityInput {
  slug: string;
  network: NearNetworkId;
  authVariables?: AuthRuntimeVariables;
  mainnetAccount: string;
}

interface TenantIdentity {
  parentAccount: string;
  accountId: string;
}

export function resolveTenantIdentity({
  slug,
  network,
  authVariables,
  mainnetAccount,
}: ResolveTenantIdentityInput): TenantIdentity {
  const parentAccount =
    authVariables?.siwn?.subAccount?.[network]?.parentAccount ??
    (network === "testnet" ? "v1.citynode.testnet" : mainnetAccount);

  return {
    parentAccount,
    accountId: slug ? `${slug}.${parentAccount}` : "",
  };
}
