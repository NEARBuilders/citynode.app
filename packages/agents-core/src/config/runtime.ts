import type { OutlayerNetwork } from "@near-intents-agent-api/outlayer";
import { requiredSlot } from "../lib/slot.js";
import { configureLogger, type LogLevel } from "../shared/logger.js";

export type AppRuntime = {
  trustedOrigins: readonly string[];
  metricsToken?: string;
  /** Legacy env:v1 key; retained until every ciphertext using it is re-encrypted. */
  secretEncryptionKey?: string;
  secretEncryptionKeys?: Record<string, string>;
  secretEncryptionActiveKeyId?: string;
  nearRpcUrls: string[];
  network: OutlayerNetwork;
  serviceUrl: string;
  /** Per-24h sponsorship ceilings for wallet initialization, policy writes and relay. */
  sponsorDailyGlobalLimit: number;
  sponsorDailyTenantLimit: number;
  sponsorDailyAgentLimit: number;
  walletPolicyStorageLimitYocto?: string;
  /** Sponsor account; receives a deleted custody account's native NEAR. Deletion needs it. */
  sponsorAccountId?: string;
  /** Authenticated requests per minute across all of a tenant's keys; defaults to 600. */
  tenantRequestsPerMinute?: number;
  /** Authenticated requests per minute for each API key; defaults to 120. */
  keyRequestsPerMinute?: number;
  /** Live agents (pending/active/archived) a tenant may hold at once; defaults to 50. */
  maxAgentsPerTenant?: number;
  /** Lifetime agent creations, including abandoned/deleted records; unset disables this cap. */
  maxCreatedAgentsPerTenant?: number;
  /** Developer-created API keys a tenant may have active; defaults to 50. */
  maxApiKeysPerTenant?: number;
  logLevel: LogLevel;
};

const slot = requiredSlot<AppRuntime>("Server runtime");

export function configureRuntime(next: AppRuntime) {
  slot.set(next);
  configureLogger(next.logLevel);
}

export function getRuntime(): AppRuntime {
  return slot.get();
}
