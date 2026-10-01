import type { OutlayerWalletClient } from "@near-intents-agent-api/outlayer";
import { logger } from "../shared/logger.js";
import { getOutlayer } from "./outlayer.js";
import {
  type AssetPrice,
  type MarketFeed,
  type MarketItem,
  maxPriceAgeMs,
  oneClickFeed,
  type PriceSource,
  usablePrice,
} from "./prices.js";
import { defaultedSlot } from "./slot.js";

/**
 * The tokens agents can use: OutLayer's catalog, and nothing more, enriched with 1Click market
 * data (chain, USD price).
 *
 * OutLayer is the allow-list because it is what custody can actually route; 1Click lists the
 * same NEAR Intents assets with prices, but anything it has that OutLayer lacks would be refused
 * on execution, so it never reaches the list. Custody's decimals are authoritative, and a price is
 * shown or charged only through `usablePrice`, so the list, balances and the budget never
 * disagree about an asset's value. OutLayer's `/wallet/v1/tokens` needs a wallet
 * credential although the catalog is global, so the API registers one throwaway wallet per
 * process, on first use, and reads the catalog with it.
 */

const providerTtlMs = 30 * 60_000;

/** One asset as the public list shows it; the shape follows the 1Click token list. */
export type CatalogToken = {
  /** NEAR Intents asset id (`nep141:…`, `1cs_v1:…`): the value every execution takes. */
  assetId: string;
  symbol: string;
  decimals: number;
  /** Chain the asset originates on, in 1Click's naming (`near`, `eth`, `sol`, …). */
  blockchain: string;
  /** USD per whole token from the 1Click feed; null when it has no usable price. */
  price: number | null;
  /** When 1Click last updated the quote, even one too old to use. */
  priceUpdatedAt: string | null;
  /** When `price` stops being usable; null with no price. Never show it after this. */
  priceExpiresAt: string | null;
};

export type TokenCatalog = PriceSource & {
  list(): Promise<CatalogToken[]>;
  /** Whether custody supports this asset, by asset id or bare contract id. */
  supports(asset: string): Promise<boolean>;
};

type ProviderToken = Awaited<ReturnType<OutlayerWalletClient["tokens"]>>["tokens"][number];

/** OutLayer names assets by bare contract; its `defuse_asset_id` is the NEAR Intents id. */
function assetIdOf(token: ProviderToken): string {
  return token.defuse_asset_id ?? `nep141:${token.id}`;
}

export function providerTokenCatalog(options: {
  outlayer: () => OutlayerWalletClient;
  market: MarketFeed;
  now?: () => number;
}): TokenCatalog {
  const now = options.now ?? Date.now;
  let credential: Promise<string> | undefined;
  let cached:
    | { fetchedAt: number; tokens: ProviderToken[]; byId: Map<string, ProviderToken> }
    | undefined;
  const mismatched = new Set<string>();
  let inflight: Promise<NonNullable<typeof cached>> | undefined;

  async function load() {
    credential ??= options
      .outlayer()
      .registerWallet()
      .then((wallet) => wallet.api_key);
    // A failed registration is retried on the next read rather than cached forever.
    credential.catch(() => {
      credential = undefined;
    });
    const { tokens } = await options.outlayer().tokens(await credential);
    const byId = new Map(
      tokens.flatMap((token) => [
        [assetIdOf(token), token],
        [token.id, token],
      ]),
    );
    return { fetchedAt: now(), tokens, byId };
  }

  /** The provider list; a failed refresh keeps serving the last good one. */
  async function provider() {
    if (cached && now() - cached.fetchedAt < providerTtlMs) return cached;
    inflight ??= load().finally(() => {
      inflight = undefined;
    });
    try {
      cached = await inflight;
    } catch (error) {
      if (!cached) throw error;
    }
    return cached;
  }

  /** The usable price of one custody token, reporting a unit disagreement once per asset. */
  function priceOf(token: ProviderToken, item: MarketItem | undefined): AssetPrice | undefined {
    if (item?.price && item.price.decimals !== token.decimals && !mismatched.has(token.id)) {
      mismatched.add(token.id);
      logger.warn("price_decimals_mismatch", {
        asset: assetIdOf(token),
        custody_decimals: token.decimals,
        feed_decimals: item.price.decimals,
      });
    }
    return usablePrice(item, token.decimals, now());
  }

  const lookup = (byId: Map<string, ProviderToken>, asset: string) =>
    byId.get(asset) ?? byId.get(asset.replace(/^nep141:/, ""));

  return {
    async list() {
      const [{ tokens }, market] = await Promise.all([provider(), options.market.items()]);
      return tokens.map((token) => {
        const assetId = assetIdOf(token);
        const item = market?.get(assetId);
        const price = priceOf(token, item);
        return {
          assetId,
          symbol: token.symbol,
          decimals: token.decimals,
          blockchain: item?.blockchain ?? token.chains[0] ?? "near",
          price: price ? (item?.priceUsd ?? null) : null,
          priceUpdatedAt: item?.priceUpdatedAt ?? null,
          priceExpiresAt: price ? new Date(price.updatedAtMs + maxPriceAgeMs).toISOString() : null,
        };
      });
    },
    async supports(asset) {
      return lookup((await provider()).byId, asset) !== undefined;
    },
    /** Budget pricing. An unsupported asset, or one whose support cannot be checked, has none. */
    async price(asset) {
      const [token, market] = await Promise.all([
        provider().then(
          ({ byId }) => lookup(byId, asset),
          () => undefined,
        ),
        options.market.items(),
      ]);
      if (!token) return undefined;
      return priceOf(token, market?.get(assetIdOf(token)));
    },
  };
}

/** The process-wide 1Click feed, shared by the token list and budget pricing. */
const market = oneClickFeed();

const catalogSlot = defaultedSlot<TokenCatalog>(
  providerTokenCatalog({ outlayer: getOutlayer, market }),
);

export function configureTokenCatalog(catalog: TokenCatalog | undefined) {
  catalogSlot.set(catalog);
}

export function getTokenCatalog(): TokenCatalog {
  return catalogSlot.get();
}

/**
 * Budget pricing: the catalog's own usable price, so the budget charges exactly what the token
 * list shows. Tests may swap it.
 */
const pricesSlot = defaultedSlot<PriceSource>({
  price: (asset) => getTokenCatalog().price(asset),
});

export function configurePrices(source: PriceSource | undefined) {
  pricesSlot.set(source);
}

export function getPrices(): PriceSource {
  return pricesSlot.get();
}
