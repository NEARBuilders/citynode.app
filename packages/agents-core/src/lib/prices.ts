import { z } from "zod";

/**
 * USD prices for the owner's spend budget. OutLayer's token catalog carries no prices, so they come
 * from the public 1Click token list (`assetId`, `decimals`, `price`), which is keyed by the same
 * NEAR Intents asset ids the agent's executions name. An asset with no fresh price is refused, not
 * guessed: a budget that silently counts an unpriced asset as free is no budget.
 */

export type AssetPrice = {
  /** Token decimals, to turn an atomic amount into whole tokens. */
  decimals: number;
  /** USD per whole token, exactly `coefficient / 10^scale`. */
  coefficient: bigint;
  scale: number;
  /** When the feed last updated this price, in epoch milliseconds. */
  updatedAtMs: number;
};

export type PriceSource = {
  /** `undefined` when the asset is unknown or its price is missing or stale. */
  price(asset: string): Promise<AssetPrice | undefined>;
};

const catalogUrl = "https://1click.chaindefuser.com/v0/tokens";
const cacheTtlMs = 60_000;
/**
 * A price this old or older, by the feed's own timestamp, is unavailable everywhere: in every read
 * that shows one and in the budget. The feed updates live assets within a minute, so an older
 * quote means 1Click stopped pricing the asset, and no refetch can make it current.
 */
export const maxPriceAgeMs = 10 * 60_000;
/** Clock disagreement tolerated between the feed's timestamps and ours. */
const maxPriceFutureSkewMs = 60_000;
const fetchTimeoutMs = 5_000;

/** Each item is validated alone: one malformed entry leaves its asset unpriced, not the list. */
const catalogItemSchema = z.looseObject({
  assetId: z.string().min(1),
  symbol: z.string().min(1).max(64).optional(),
  decimals: z.number().int().nonnegative().max(36),
  blockchain: z.string().optional(),
  contractAddress: z.string().optional(),
  price: z.unknown(),
  priceUpdatedAt: z.string().nullish(),
});

const maxPriceDigits = 128;
const maxPriceScale = 160;
const maxPriceExponent = 100;
/** A whole token above this is a corrupt feed, not a price. */
const maxPriceUsd = 1_000_000_000n;
const maxAmountDigits = 78;

/**
 * Parses a positive decimal such as `4.5` or `1.49e-12` exactly, with no binary-float arithmetic.
 * Undefined for anything that is not a bounded positive price.
 */
export function parseDecimalPrice(
  text: string,
): Pick<AssetPrice, "coefficient" | "scale"> | undefined {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]{1,3}))?$/.exec(text);
  if (!match) return undefined;
  const fraction = match[2] ?? "";
  const digits = `${match[1]}${fraction}`;
  const exponent = Number(match[3] ?? "0");
  if (digits.length > maxPriceDigits || Math.abs(exponent) > maxPriceExponent) return undefined;
  let coefficient = BigInt(digits);
  let scale = fraction.length - exponent;
  if (scale > maxPriceScale) return undefined;
  if (scale < 0) {
    coefficient *= 10n ** BigInt(-scale);
    scale = 0;
  }
  if (coefficient === 0n || coefficient >= maxPriceUsd * 10n ** BigInt(scale)) return undefined;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

/**
 * A price is usable from the feed's own timestamp, not from when we happened to fetch the list:
 * a quote already past `maxPriceAgeMs` is refused however recently it was cached, and one dated
 * ahead of our clock by more than a small skew is a bad timestamp rather than a fresh price.
 */
export function isPriceFresh(price: AssetPrice, nowMs: number): boolean {
  return (
    price.updatedAtMs <= nowMs + maxPriceFutureSkewMs && nowMs - price.updatedAtMs < maxPriceAgeMs
  );
}

type CatalogItem = z.infer<typeof catalogItemSchema>;

/** One 1Click catalog entry: its market metadata and, when usable, its exact price. */
export type MarketItem = {
  assetId: string;
  symbol: string | null;
  decimals: number;
  blockchain: string | null;
  /**
   * The feed's price as published, for display; budget math uses `price`. Neither is usable
   * until `usablePrice` accepts the entry.
   */
  priceUsd: number | null;
  priceUpdatedAt: string | null;
  price: AssetPrice | undefined;
};

/** The 1Click catalog keyed by asset id, and by bare contract id for NEAR-native tokens. */
export type MarketFeed = {
  items(): Promise<ReadonlyMap<string, MarketItem> | undefined>;
};

/** A numeric token constructed only by our JSON reviver, never a quoted or object feed price. */
class PriceNumber {
  constructor(readonly source: string) {}
}

function parseCatalogBody(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source?: string }): unknown => {
    if (key !== "price" || typeof value !== "number") return value;
    // Node >=24 exposes the original numeric lexeme. Missing support fails closed;
    // String(value) would already have lost any source digits rounded by JSON.parse.
    return typeof context?.source === "string" ? new PriceNumber(context.source) : null;
  });
}

/** The price of one catalog item, or undefined when it is missing, undated or absurd. */
function priceOf(item: CatalogItem): AssetPrice | undefined {
  const updatedAtMs = item.priceUpdatedAt ? Date.parse(item.priceUpdatedAt) : Number.NaN;
  if (!Number.isFinite(updatedAtMs) || !(item.price instanceof PriceNumber)) return undefined;
  const decimal = parseDecimalPrice(item.price.source);
  return decimal ? { decimals: item.decimals, ...decimal, updatedAtMs } : undefined;
}

function marketItem(item: CatalogItem): MarketItem {
  const price = priceOf(item);
  return {
    assetId: item.assetId,
    symbol: item.symbol ?? null,
    decimals: item.decimals,
    blockchain: item.blockchain ?? null,
    priceUsd: price && item.price instanceof PriceNumber ? Number(item.price.source) : null,
    priceUpdatedAt: price ? (item.priceUpdatedAt ?? null) : null,
    price,
  };
}

function indexCatalog(items: CatalogItem[]): Map<string, MarketItem> {
  const byAsset = new Map<string, MarketItem>();
  for (const item of items) {
    const entry = marketItem(item);
    byAsset.set(item.assetId, entry);
    // A NEAR-native token is also named by its bare contract id in OutLayer's catalog.
    if (item.blockchain === "near" && item.contractAddress)
      byAsset.set(item.contractAddress, entry);
  }
  return byAsset;
}

/** Reads the 1Click catalog with a short cache. A failed refresh keeps no stale entry alive. */
export function oneClickFeed(
  options: { url?: string; fetch?: typeof fetch; now?: () => number } = {},
): MarketFeed {
  const now = options.now ?? Date.now;
  const request = options.fetch ?? fetch;
  let cached: { fetchedAt: number; byAsset: Map<string, MarketItem> } | undefined;
  let inflight: Promise<typeof cached> | undefined;

  async function load(): Promise<typeof cached> {
    try {
      const response = await request(options.url ?? catalogUrl, {
        signal: AbortSignal.timeout(fetchTimeoutMs),
      });
      if (!response.ok) return undefined;
      const body: unknown = parseCatalogBody(await response.text());
      if (!Array.isArray(body)) return undefined;
      const items = body.flatMap((raw) => {
        const parsed = catalogItemSchema.safeParse(raw);
        return parsed.success ? [parsed.data] : [];
      });
      return { fetchedAt: now(), byAsset: indexCatalog(items) };
    } catch {
      return undefined;
    }
  }

  return {
    async items() {
      if (cached && now() - cached.fetchedAt < cacheTtlMs) return cached.byAsset;
      inflight ??= load().finally(() => {
        inflight = undefined;
      });
      cached = await inflight;
      return cached?.byAsset;
    },
  };
}

/**
 * The one rule for a usable USD price, shared by every read that shows a price and by the budget.
 * The quote must be fresh, and 1Click must count the asset in the same decimals as custody:
 * one symbol spans chains with different decimals (USDC is 6 on most, 18 on BSC), so a quote in
 * other units would misvalue an amount by orders of magnitude. No custody token, no price.
 */
export function usablePrice(
  item: MarketItem | undefined,
  custodyDecimals: number | undefined,
  nowMs: number,
): AssetPrice | undefined {
  const price = item?.price;
  if (!price || price.decimals !== custodyDecimals) return undefined;
  return isPriceFresh(price, nowMs) ? price : undefined;
}

/**
 * USD value of an atomic amount in millionths of a dollar: `amount / 10^decimals * price`, with a
 * single rounding up at the end so a cap is never under-counted. Throws `usd_value_out_of_range`
 * when the value exceeds what a cap can hold, which no cap can admit.
 */
export function usdMicros(amount: string, price: AssetPrice): number {
  if (!new RegExp(`^[0-9]{1,${maxAmountDigits}}$`).test(amount))
    throw new RangeError("invalid_amount");
  const numerator = BigInt(amount) * price.coefficient * 1_000_000n;
  const denominator = 10n ** BigInt(price.decimals + price.scale);
  const value = (numerator + denominator - 1n) / denominator;
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("usd_value_out_of_range");
  return Number(value);
}
