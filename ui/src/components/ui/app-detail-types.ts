export type RegistryAppDetail = {
  accountId: string;
  gatewayId: string;
  canonicalKey: string;
  canonicalConfigUrl: string;
  startCommand: string;
  domain: string | null;
  openUrl: string | null;
  hostUrl: string | null;
  uiUrl: string | null;
  uiSsrUrl: string | null;
  apiUrl: string | null;
  extends: string | null;
  parent: string | null;
  root: string | null;
  depth: number;
  status: "ready" | "invalid";
  metadata: {
    claimedBy: string | null;
    title: string | null;
    description: string | null;
    repoUrl: string | null;
    homepageUrl: string | null;
    imageUrl: string | null;
    updatedAt: string | null;
  } | null;
  metadataKey: string;
  metadataContractId: string;
  metadataFastKvUrl: string;
  extendsChain: string[];
  resolvedConfig: Record<string, unknown>;
};

export type RegistryStatus = {
  discoveredApps: number;
  metadataContractId: string;
  metadataFastKvUrl: string;
  relayEnabled: boolean;
  relayAccountId: string | null;
  timestamp: string;
};

export interface AppDetailContentProps {
  accountId: string;
  gatewayId: string;
  app: RegistryAppDetail;
  statusQuery: { data?: RegistryStatus };
}

export const BASE_RUNTIME = "bos://dev.everything.near/everything.dev";
