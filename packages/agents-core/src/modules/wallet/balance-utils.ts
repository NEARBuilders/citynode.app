import type { BalanceEntry } from "@near-intents-agent-api/contracts";
import type { CatalogToken } from "../../lib/token-catalog.js";

/** Exact token units without floating point or rounding. */
export function tokenUnits(raw: string, decimals: number): string {
  const value = BigInt(raw);
  const divisor = 10n ** BigInt(decimals);
  const whole = value / divisor;
  const fraction = (value % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function enrichBalance(
  assetId: string,
  balanceRaw: string,
  catalog: ReadonlyMap<string, CatalogToken>,
  provider?: { symbol?: string; decimals?: number },
): BalanceEntry {
  const token = catalog.get(assetId);
  const native = assetId === "nep141:native";
  const decimals = token?.decimals ?? (native ? 24 : (provider?.decimals ?? null));
  return {
    assetId,
    symbol: token?.symbol ?? (native ? "NEAR" : (provider?.symbol ?? null)),
    decimals,
    blockchain: token?.blockchain ?? (native ? "near" : null),
    price: token?.price ?? null,
    priceUpdatedAt: token?.priceUpdatedAt ?? null,
    priceExpiresAt: token?.priceExpiresAt ?? null,
    balanceRaw,
    balance: decimals === null ? null : tokenUnits(balanceRaw, decimals),
  };
}
