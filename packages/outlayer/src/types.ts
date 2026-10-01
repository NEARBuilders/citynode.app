import type { OutlayerChain } from "./schemas.js";

export const outlayerNetworks = {
  mainnet: {
    baseUrl: "https://api.outlayer.fastnear.com",
    contractId: "outlayer.near",
  },
} as const;

export type OutlayerNetwork = keyof typeof outlayerNetworks;

export type OutlayerPolicyRules = {
  allowed_tokens: string[];
  transaction_types: string[];
  limits?: Record<string, Record<string, string>>;
  rate_limit?: { max_per_hour: number };
  addresses?: { mode: "whitelist" | "blacklist"; list: string[] };
  items?: Record<string, string[]>;
};

export type OutlayerPolicyDocument = {
  version: 1;
  capabilities: Record<string, unknown>;
  frozen: boolean;
  rules: OutlayerPolicyRules;
  approval?: Record<string, unknown>;
};

export type OutlayerClientOptions = {
  fetch?: typeof fetch;
  /** Bounded provider timeout in milliseconds. */
  timeoutMs?: number;
  /** Retry backoff for rate limiting and transport blips. Tests override this. */
  retryDelayMs?: (attempt: number) => number;
  /** Circuit-breaker tuning; defaults are 5 consecutive failures and a 10s cooldown. */
  breakerOptions?: { failureThreshold?: number; cooldownMs?: number };
};

export type WalletRequest = {
  apiKey: string;
  idempotencyKey?: string;
  body?: unknown;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string | number | undefined>;
};

export type ProviderRequest = (input: WalletRequest) => Promise<unknown>;

export type { OutlayerChain };
