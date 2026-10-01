export type { DatabaseHandle, Db, Tx } from "./client.js";
export { createDatabase } from "./client.js";
export { advisoryLockKey } from "./lock.js";
export type {
  AgentLifecycle,
  CustodyWalletStatus,
  OperationKind,
  OperationStatus,
  OwnerIntentState,
  SpendChargeState,
  SponsorReservationState,
  WalletPolicyStatus,
} from "./schema/domain.js";
export {
  account,
  agentGrants,
  agents,
  apiKeys,
  auditEvents,
  auditRetentionHolds,
  authSchema,
  custodyWallets,
  delayedExecutions,
  intentGenerations,
  operationArtifacts,
  operations,
  operationTombstones,
  ownerIntents,
  ownerNonces,
  ownerReceipts,
  quotaChanges,
  rateLimit,
  requestBuckets,
  schema,
  session,
  spendCharges,
  sponsorReservations,
  tenants,
  user,
  verification,
  walletPolicies,
} from "./schema/index.js";

export type { TryAdvisoryLock, TryLockResult } from "./try-lock.js";
