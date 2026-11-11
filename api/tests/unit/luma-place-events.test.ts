import { createHmac } from "node:crypto";
import type { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Database, DatabaseError } from "@/db";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import {
  discoveryActivities,
  discoveryProfiles,
  nodes,
  type PlaceBoundary,
  placeAliases,
  places,
  tenants,
} from "@/db/schema";
import { DiscoveryLive, type DiscoveryService, DiscoveryTag } from "@/services/discovery";
import { GeocodeTag } from "@/services/discovery-geocode";
import { createServiceHarness, createTempDb } from "./test-harness";

const SECRET = "whsec_fixture";
const MAIN_CALENDAR = "cal-main";

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
  vi.unstubAllGlobals();
});

function freshLayer() {
  const temp = createTempDb("api-luma-places-");
  cleanup = temp.cleanup;
  const database = DatabaseLive(temp.url);
  const geocode = Layer.succeed(GeocodeTag, {
    geocode: () => Effect.succeed({ ok: false as const, reason: "unavailable" as const }),
    resetForTests: Effect.void,
  });
  return Layer.mergeAll(
    DiscoveryLive({
      lumaKeys: "main-key",
      lumaMainCalendarId: MAIN_CALENDAR,
      lumaWebhookSecrets: SECRET,
    }).pipe(Layer.provide(database), Layer.provide(geocode)),
    database,
  ).pipe(Layer.provide(Layer.succeed(PluginIdTag, "api"))) as Layer.Layer<
    DiscoveryTag | DatabaseTag,
    DatabaseError,
    never
  >;
}

const { run, squashError } = createServiceHarness<
  { discovery: DiscoveryService; db: Database },
  DiscoveryTag | DatabaseTag,
  DatabaseError,
  ORPCError<string, unknown>
>(
  Effect.gen(function* () {
    return { discovery: yield* DiscoveryTag, db: yield* DatabaseTag };
  }),
);

function box(minLng: number, minLat: number, maxLng: number, maxLat: number): PlaceBoundary {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
}

async function seed(db: Database) {
  const insertPlace = async (
    slug: string,
    name: string,
    label: string,
    parentId: string | null,
    boundary: PlaceBoundary | null,
  ) => {
    const [row] = await db
      .insert(places)
      .values({ slug, name, label, parentId, boundary })
      .returning();
    return row!.id;
  };
  const usa = await insertPlace(
    "united-states",
    "United States of America",
    "country",
    null,
    box(-125, 24, -66, 50),
  );
  await db.insert(placeAliases).values({ value: "US", kind: "iso", placeId: usa });
  const illinois = await insertPlace(
    "illinois",
    "Illinois",
    "subdivision",
    usa,
    box(-91.5, 37, -87.5, 42.5),
  );
  const chicago = await insertPlace("chicago", "Chicago", "city", illinois, null);
  const newYork = await insertPlace(
    "new-york",
    "New York",
    "subdivision",
    usa,
    box(-79.8, 40.5, -71.8, 45),
  );
  const nyc = await insertPlace("new-york-city", "New York", "city", newYork, null);
  const community = async (slug: string, placeId: string) => {
    const [tenant] = await db
      .insert(tenants)
      .values({ accountId: `${slug}.near`, name: slug })
      .returning();
    const [node] = await db
      .insert(nodes)
      .values({ slug, name: slug, tenantId: tenant!.id, placeId })
      .returning();
    await db.insert(discoveryProfiles).values({
      nodeId: node!.id,
      data: {
        nodeId: node!.id,
        summary: "",
        location: slug,
        region: "",
        latitude: null,
        longitude: null,
        channels: [],
        published: true,
      },
    });
    return node!.id;
  };
  return {
    places: { usa, illinois, chicago, nyc },
    nodes: {
      usa: await community("usa", usa),
      chicago: await community("chicago", chicago),
      nyc: await community("nyc", nyc),
    },
  };
}

function lumaEvent(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === "string" ? overrides.id : "evt-chicago";
  return {
    platform: "luma",
    id: "evt-chicago",
    calendar_id: MAIN_CALENDAR,
    name: "Chicago builders night",
    url: id === "evt-chicago" ? "https://lu.ma/chicago-builders" : `https://luma.com/${id}`,
    start_at: "2099-01-10T23:00:00Z",
    end_at: "2099-01-11T01:00:00Z",
    created_at: "2026-11-01T12:00:00Z",
    timezone: "America/Chicago",
    visibility: "public",
    location_visibility: "public",
    location_type: "offline",
    meeting_url: null,
    coordinate: { latitude: 41.88, longitude: -87.63 },
    geo_address_json: {
      city: "Chicago",
      region: "Illinois",
      country: "United States",
      full_address: "1 Builder Way, Chicago, IL",
      city_state: "Chicago, Illinois",
    },
    geo_latitude: "41.88",
    geo_longitude: "-87.63",
    ...overrides,
  };
}

function signed(payload: unknown, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)) {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return { rawBody, signature: `t=${timestamp},v1=${signature}` };
}

async function eventIdsFor(discovery: DiscoveryService, nodeId: string) {
  const node = await Effect.runPromise(discovery.get(nodeId));
  return (node?.events ?? []).map((event) => event.title);
}

describe("Luma place association", () => {
  it("associates webhook events with the deepest place and rolls them up the tree", async () => {
    const layer = freshLayer();
    const ids = await run(layer, ({ db }) => seed(db));

    expect(
      await run(layer, ({ discovery }) =>
        discovery.receiveLumaWebhook(signed({ type: "event.created", data: lumaEvent() })),
      ),
    ).toEqual({ result: "associated" });

    await run(layer, async ({ discovery, db }) => {
      const [row] = await db.select().from(discoveryActivities);
      expect(row).toMatchObject({ ownerNodeId: null, placeId: ids.places.chicago });
      expect(row?.data.luma).toMatchObject({ eventId: "evt-chicago", placeMatch: "coordinate" });
      expect(row?.data.url).toBe("https://luma.com/chicago-builders");
      expect(await eventIdsFor(discovery, ids.nodes.chicago)).toEqual(["Chicago builders night"]);
      expect(await eventIdsFor(discovery, ids.nodes.usa)).toEqual(["Chicago builders night"]);
      expect(await eventIdsFor(discovery, ids.nodes.nyc)).toEqual([]);
      const detail = await Effect.runPromise(discovery.activity(row!.id));
      expect(detail?.nodeIds).toEqual([ids.nodes.chicago, ids.nodes.usa]);
    });

    expect(
      await run(layer, ({ discovery }) =>
        discovery.receiveLumaWebhook(
          signed({
            type: "event.updated",
            data: lumaEvent({
              coordinate: { latitude: 40.71, longitude: -74 },
              geo_address_json: { city: "New York", region: "New York", country: "United States" },
            }),
          }),
        ),
      ),
    ).toEqual({ result: "associated" });

    await run(layer, async ({ discovery, db }) => {
      const rows = await db.select().from(discoveryActivities);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.placeId).toBe(ids.places.nyc);
      expect(await eventIdsFor(discovery, ids.nodes.chicago)).toEqual([]);
      expect(await eventIdsFor(discovery, ids.nodes.nyc)).toEqual(["Chicago builders night"]);
      expect(await eventIdsFor(discovery, ids.nodes.usa)).toEqual(["Chicago builders night"]);
    });

    expect(
      await run(layer, ({ discovery }) =>
        discovery.receiveLumaWebhook(signed({ type: "event.canceled", data: lumaEvent() })),
      ),
    ).toEqual({ result: "removed" });
    await run(layer, async ({ discovery, db }) => {
      expect(await db.select().from(discoveryActivities)).toHaveLength(0);
      expect(await eventIdsFor(discovery, ids.nodes.usa)).toEqual([]);
    });
  });

  it("matches by address without coordinates and keeps online events off public feeds", async () => {
    const layer = freshLayer();
    const ids = await run(layer, ({ db }) => seed(db));
    const addressOnly = lumaEvent({
      id: "evt-address",
      name: "Address only",
      url: "https://luma.com/address-only",
      coordinate: null,
    });
    const online = lumaEvent({
      id: "evt-online",
      name: "Online call",
      url: "https://luma.com/online-call",
      location_type: "zoom",
      coordinate: null,
      geo_address_json: null,
    });

    await run(layer, async ({ discovery, db }) => {
      expect(
        await Effect.runPromise(
          discovery.receiveLumaWebhook(signed({ type: "event.created", data: addressOnly })),
        ),
      ).toEqual({ result: "associated" });
      expect(
        await Effect.runPromise(
          discovery.receiveLumaWebhook(signed({ type: "event.created", data: online })),
        ),
      ).toEqual({ result: "unmatched" });
      const rows = await db.select().from(discoveryActivities);
      expect(rows.find((row) => row.data.title === "Address only")).toMatchObject({
        placeId: ids.places.chicago,
        data: { luma: { placeMatch: "address" } },
      });
      const unmatched = rows.find((row) => row.data.title === "Online call");
      expect(unmatched).toMatchObject({ placeId: null, data: { luma: { placeMatch: "none" } } });
      expect(await Effect.runPromise(discovery.activity(unmatched!.id))).toBeNull();
      expect(await eventIdsFor(discovery, ids.nodes.usa)).toEqual(["Address only"]);
    });
  });

  it("never stores private events and removes events that become private", async () => {
    const layer = freshLayer();
    await run(layer, ({ db }) => seed(db));
    await run(layer, async ({ discovery, db }) => {
      await Effect.runPromise(
        discovery.receiveLumaWebhook(signed({ type: "event.created", data: lumaEvent() })),
      );
      expect(
        await Effect.runPromise(
          discovery.receiveLumaWebhook(
            signed({ type: "event.updated", data: lumaEvent({ visibility: "members-only" }) }),
          ),
        ),
      ).toEqual({ result: "removed" });
      expect(await db.select().from(discoveryActivities)).toHaveLength(0);
      await Effect.runPromise(
        discovery.receiveLumaWebhook(
          signed({ type: "event.created", data: lumaEvent({ visibility: "private" }) }),
        ),
      );
      expect(await db.select().from(discoveryActivities)).toHaveLength(0);
    });
  });

  it("rejects unsigned, mis-signed and stale deliveries", async () => {
    const layer = freshLayer();
    const payload = { type: "event.created", data: lumaEvent() };
    const stale = Math.floor(Date.now() / 1000) - 3600;
    for (const delivery of [
      { ...signed(payload), signature: null },
      signed(payload, "whsec_wrong"),
      signed(payload, SECRET, stale),
      { ...signed(payload), rawBody: JSON.stringify({ ...payload, type: "event.canceled" }) },
    ])
      expect(
        await squashError(layer, ({ discovery }) => discovery.receiveLumaWebhook(delivery)),
      ).toMatchObject({ code: "UNAUTHORIZED" });
    expect(
      await run(layer, ({ discovery }) =>
        discovery.receiveLumaWebhook(signed({ type: "guest.registered", data: {} })),
      ),
    ).toEqual({ result: "ignored" });
  });

  it("fetches events added to the calendar and backfills the main calendar", async () => {
    const layer = freshLayer();
    const ids = await run(layer, ({ db }) => seed(db));
    const realFetch = globalThis.fetch;
    const requests: string[] = [];
    vi.stubGlobal("fetch", async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== "https://public-api.luma.com") return realFetch(input, init);
      expect(new Headers(init?.headers).get("x-luma-api-key")).toBe("main-key");
      requests.push(`${url.pathname}${url.search}`);
      if (url.pathname === "/v1/calendars/get")
        return Response.json({ id: MAIN_CALENDAR, name: "Main", url: "https://luma.com/main" });
      if (url.pathname === "/v1/events/get")
        return Response.json(lumaEvent({ id: "evt-added", name: "Added event", access: "view" }));
      return Response.json({
        entries: [
          lumaEvent({ id: "evt-past", name: "Past meetup", end_at: "2026-01-01T02:00:00Z" }),
          lumaEvent({ id: "evt-added", name: "Added event" }),
          lumaEvent({ id: "evt-private", visibility: "private" }),
          lumaEvent({ id: "evt-remote", name: "Remote", coordinate: null, geo_address_json: null }),
        ].map((event) =>
          event.id === "evt-past" ? { ...event, start_at: "2026-01-01T00:00:00Z" } : event,
        ),
        has_more: false,
      });
    });

    await run(layer, async ({ discovery }) => {
      expect(
        await Effect.runPromise(
          discovery.receiveLumaWebhook(
            signed({ type: "calendar.event.added", data: { id: "evt-added", platform: "luma" } }),
          ),
        ),
      ).toEqual({ result: "associated" });
      expect(requests).toContain("/v1/events/get?event_id=evt-added");
      expect(
        await Effect.runPromise(
          discovery.receiveLumaWebhook(
            signed({ type: "calendar.event.added", data: { id: "cev-x", platform: "external" } }),
          ),
        ),
      ).toEqual({ result: "ignored" });
    });

    expect(
      await squashError(layer, ({ discovery }) =>
        discovery.backfillLumaPlaceEvents({ userId: "member", user: { role: "user" } } as never),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await run(layer, ({ discovery }) =>
        discovery.backfillLumaPlaceEvents({ userId: "admin", user: { role: "admin" } } as never),
      ),
    ).toEqual({ imported: 2, updated: 1, unmatched: 1 });

    await run(layer, async ({ discovery, db }) => {
      const rows = await db.select().from(discoveryActivities);
      expect(rows.map((row) => row.data.title).sort()).toEqual([
        "Added event",
        "Past meetup",
        "Remote",
      ]);
      expect(rows.find((row) => row.data.title === "Past meetup")?.placeId).toBe(
        ids.places.chicago,
      );
      expect(await eventIdsFor(discovery, ids.nodes.usa)).toEqual(["Added event"]);
    });
  });

  it("shows a community's own import once when the main calendar lists the same event", async () => {
    const layer = freshLayer();
    const ids = await run(layer, ({ db }) => seed(db));
    await run(layer, async ({ discovery, db }) => {
      const own = crypto.randomUUID();
      await db.insert(discoveryActivities).values({
        id: own,
        ownerNodeId: ids.nodes.chicago,
        canonicalUrl: "https://luma.com/chicago-builders",
        data: {
          id: own,
          ownerNodeId: ids.nodes.chicago,
          nodeIds: [ids.nodes.chicago],
          kind: "event",
          title: "Chicago builders night (community calendar)",
          summary: "",
          url: "https://luma.com/chicago-builders",
          source: "Luma · Chicago",
          publishedAt: "2026-11-01T12:00:00.000Z",
          startsAt: "2099-01-10T23:00:00.000Z",
          endsAt: "2099-01-11T01:00:00.000Z",
          timezone: "America/Chicago",
          venue: "Chicago",
          status: "published",
          luma: {
            calendarId: "cal-chicago",
            eventId: "evt-chicago",
            syncedAt: "2026-11-01T12:00:00.000Z",
            available: true,
            hidden: false,
          },
        },
      });
      await Effect.runPromise(
        discovery.receiveLumaWebhook(signed({ type: "event.created", data: lumaEvent() })),
      );
      const expected = ["Chicago builders night (community calendar)"];
      expect(await eventIdsFor(discovery, ids.nodes.chicago)).toEqual(expected);
      expect(await eventIdsFor(discovery, ids.nodes.usa)).toEqual(expected);
      expect(await eventIdsFor(discovery, ids.nodes.nyc)).toEqual([]);
      await db.delete(discoveryActivities).where(eq(discoveryActivities.id, own));
    });
  });

  it("is unavailable until a main calendar and webhook secret are configured", async () => {
    const temp = createTempDb("api-luma-unconfigured-");
    const database = DatabaseLive(temp.url);
    const layer = DiscoveryLive({}).pipe(
      Layer.provide(database),
      Layer.provide(
        Layer.succeed(GeocodeTag, {
          geocode: () => Effect.succeed({ ok: false as const, reason: "unavailable" as const }),
          resetForTests: Effect.void,
        }),
      ),
      Layer.provideMerge(database),
      Layer.provide(Layer.succeed(PluginIdTag, "api")),
    ) as Layer.Layer<DiscoveryTag | DatabaseTag, DatabaseError, never>;
    try {
      expect(
        await squashError(layer, ({ discovery }) =>
          discovery.receiveLumaWebhook(signed({ type: "event.created", data: lumaEvent() })),
        ),
      ).toMatchObject({ code: "NOT_FOUND" });
    } finally {
      temp.cleanup();
    }
  });
});
