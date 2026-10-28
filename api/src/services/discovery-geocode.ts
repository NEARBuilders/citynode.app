import { Clock, Context, Duration, Effect, Layer, Ref, Semaphore } from "effect";

export type CountryBoundary =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export type GeocodeResult =
  | { ok: true; latitude: number; longitude: number; boundary?: CountryBoundary }
  | { ok: false; reason: "not_found" | "unavailable" };

export type GeocodeIdentity = {
  domain: string;
  repository: string;
};

type CacheEntry = {
  latitude: number;
  longitude: number;
  boundary?: CountryBoundary;
  expiresAt: number;
};

type NominatimRow = {
  lat?: string;
  lon?: string;
  addresstype?: string;
  geojson?: { type?: string; coordinates?: unknown };
};

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL = Duration.millis(1100);
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BOUNDARY_TOLERANCE = "0.05";

function normalizeLocation(location: string) {
  return location.trim().replace(/\s+/g, " ").toLowerCase();
}

function clampLatitude(value: number) {
  return Math.min(85, Math.max(-85, value));
}

function clampLongitude(value: number) {
  return Math.min(180, Math.max(-180, value));
}

export function countryBoundary(row: NominatimRow): CountryBoundary | undefined {
  const shape = row.geojson;
  if (row.addresstype !== "country" || !shape || !Array.isArray(shape.coordinates))
    return undefined;
  if (shape.type === "Polygon")
    return { type: "Polygon", coordinates: shape.coordinates as number[][][] };
  if (shape.type === "MultiPolygon")
    return { type: "MultiPolygon", coordinates: shape.coordinates as number[][][][] };
  return undefined;
}

export function profilePlace(profile: { location: string; region: string }, kind: string | null) {
  const location = profile.location.trim();
  if (location || kind !== "country") return location;
  return profile.region.trim();
}

export function nominatimUserAgent(identity: GeocodeIdentity) {
  const domain = identity.domain.trim() || "localhost";
  const repository = identity.repository.trim();
  return repository
    ? `${domain}/discovery-geocode (${repository}; geocode)`
    : `${domain}/discovery-geocode (geocode)`;
}

export type GeocodeService = {
  geocode: (location: string) => Effect.Effect<GeocodeResult>;
  resetForTests: Effect.Effect<void>;
};

const runFetch = (url: string | URL, init?: RequestInit): Promise<Response> => fetch(url, init);

export class GeocodeTag extends Context.Service<GeocodeTag, GeocodeService>()("api/Geocode") {}

export const GeocodeLive = (identity: GeocodeIdentity) =>
  Layer.effect(
    GeocodeTag,
    Effect.gen(function* () {
      const cache = yield* Ref.make(new Map<string, CacheEntry>());
      const lastRequestAt = yield* Ref.make(0);
      const lock = yield* Semaphore.make(1);
      const userAgent = nominatimUserAgent(identity);

      const readCache = (key: string) =>
        Ref.get(cache).pipe(
          Effect.map((entries) => {
            const cached = entries.get(key);
            if (!cached || cached.expiresAt <= Date.now()) return null;
            return {
              ok: true as const,
              latitude: cached.latitude,
              longitude: cached.longitude,
              ...(cached.boundary ? { boundary: cached.boundary } : {}),
            };
          }),
        );

      const lookupNominatim = (location: string, key: string) =>
        Effect.gen(function* () {
          const last = yield* Ref.get(lastRequestAt);
          const now = yield* Clock.currentTimeMillis;
          const waitMs = Math.max(0, Duration.toMillis(MIN_INTERVAL) - (now - last));
          if (waitMs > 0) yield* Effect.sleep(Duration.millis(waitMs));
          yield* Ref.set(lastRequestAt, yield* Clock.currentTimeMillis);

          const url = new URL(NOMINATIM_URL);
          url.searchParams.set("q", location.trim());
          url.searchParams.set("format", "json");
          url.searchParams.set("limit", "1");
          url.searchParams.set("polygon_geojson", "1");
          url.searchParams.set("polygon_threshold", BOUNDARY_TOLERANCE);

          const result = yield* Effect.tryPromise({
            try: async (): Promise<GeocodeResult> => {
              const response = await runFetch(url, {
                headers: {
                  Accept: "application/json",
                  "User-Agent": userAgent,
                },
                signal: AbortSignal.timeout(8_000),
              });
              if (!response.ok) return { ok: false, reason: "unavailable" };
              const rows = (await response.json()) as NominatimRow[];
              const first = rows[0];
              const latitude = first?.lat !== undefined ? Number(first.lat) : Number.NaN;
              const longitude = first?.lon !== undefined ? Number(first.lon) : Number.NaN;
              if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return { ok: false, reason: "not_found" };
              }
              const boundary = countryBoundary(first ?? {});
              return {
                ok: true,
                latitude: clampLatitude(latitude),
                longitude: clampLongitude(longitude),
                ...(boundary ? { boundary } : {}),
              };
            },
            catch: (): GeocodeResult => ({ ok: false, reason: "unavailable" }),
          }).pipe(Effect.catch((error) => Effect.succeed(error)));

          if (result.ok) {
            yield* Ref.update(cache, (entries) => {
              const next = new Map(entries);
              next.set(key, {
                latitude: result.latitude,
                longitude: result.longitude,
                boundary: result.boundary,
                expiresAt: Date.now() + CACHE_TTL_MS,
              });
              return next;
            });
          }
          return result;
        });

      const geocode = Effect.fn("geocodeLocation")(function* (location: string) {
        const key = normalizeLocation(location);
        if (!key) return { ok: false as const, reason: "not_found" as const };

        const hit = yield* readCache(key);
        if (hit) return hit;

        return yield* lock.withPermits(1)(
          Effect.gen(function* () {
            const cached = yield* readCache(key);
            if (cached) return cached;
            return yield* lookupNominatim(location, key);
          }),
        );
      });

      return GeocodeTag.of({
        geocode,
        resetForTests: Effect.gen(function* () {
          yield* Ref.set(cache, new Map());
          yield* Ref.set(lastRequestAt, 0);
        }),
      });
    }),
  );

export function shouldGeocodeProfile(input: {
  location: string;
  latitude: number | null;
  longitude: number | null;
  geocodedLocation?: string | null;
}) {
  const location = input.location.trim();
  if (!location) return false;
  const hasCoords = input.latitude !== null && input.longitude !== null;
  const geocodedFor = input.geocodedLocation?.trim() || null;
  if (hasCoords && geocodedFor === location) return false;
  return true;
}
