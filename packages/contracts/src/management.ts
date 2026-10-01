export type ManagedAgent = {
  id: string;
  name: string;
  externalUserId: string | null;
  ownerAccountId: string | null;
  ownerWalletBound: boolean;
  walletProvisioned: boolean;
  policyStatus: "none" | "signed" | "applied" | "failed";
};
export type ManagementSummary = {
  agents: number;
  operations: number;
  pending: number;
  uncertain: number;
  settled: number;
  observedAt: string;
  period: "all_time";
};
