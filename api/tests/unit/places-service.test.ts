import type { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import type { Database, DatabaseError } from "@/db";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import {
  memberCountObservations,
  nodes as nodesTable,
  placeAliases,
  places as placesTable,
} from "@/db/schema";
import { NodesLive, type NodesService, NodesTag } from "@/services/nodes";
import { PlacesLive, type PlacesService, PlacesTag } from "@/services/places";
import { TenantsLive, type TenantsService, TenantsTag } from "@/services/tenants";
import { createServiceHarness, createTempDb } from "./test-harness";

let cleanup: (() => void) | null = null;

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

function freshLayer(): Layer.Layer<
  PlacesTag | NodesTag | TenantsTag | DatabaseTag,
  DatabaseError,
  never
> {
  const temp = createTempDb("api-places-");
  cleanup = temp.cleanup;
  const database = DatabaseLive(temp.url);
  return Layer.mergeAll(
    PlacesLive.pipe(Layer.provide(database)),
    NodesLive.pipe(Layer.provide(database)),
    TenantsLive.pipe(Layer.provide(database)),
    database,
  ).pipe(Layer.provide(Layer.succeed(PluginIdTag, "api"))) as Layer.Layer<
    PlacesTag | NodesTag | TenantsTag | DatabaseTag,
    DatabaseError,
    never
  >;
}

interface TestServices {
  places: PlacesService;
  nodes: NodesService;
  tenants: TenantsService;
  db: Database;
}

const { run: runService, squashError: squashServiceError } = createServiceHarness<
  TestServices,
  PlacesTag | NodesTag | TenantsTag | DatabaseTag,
  DatabaseError,
  ORPCError<string, unknown>
>(
  Effect.gen(function* () {
    return {
      places: yield* PlacesTag,
      nodes: yield* NodesTag,
      tenants: yield* TenantsTag,
      db: yield* DatabaseTag,
    };
  }),
);

interface PlaceFixture {
  slug: string;
  name: string;
  parentId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
}

async function insertPlace(db: Database, fixture: PlaceFixture) {
  const [row] = await db
    .insert(placesTable)
    .values({
      slug: fixture.slug,
      name: fixture.name,
      parentId: fixture.parentId ?? null,
      latitude: fixture.latitude ?? null,
      longitude: fixture.longitude ?? null,
      label: fixture.label ?? null,
    })
    .returning();
  if (!row) throw new Error("place insert returned no row");
  return row;
}

async function insertAlias(
  db: Database,
  value: string,
  kind: "geonames" | "iso" | "legacy",
  placeId: string,
) {
  await db.insert(placeAliases).values({ value, kind, placeId });
}

describe("PlacesService", () => {
  it("resolve by slug returns the place with aliases and no community", async () => {
    const layer = freshLayer();
    const place = await runService(layer, ({ db }) =>
      insertPlace(db, {
        slug: "nigeria",
        name: "Nigeria",
        label: "country",
        latitude: 9.08,
        longitude: 8.67,
      }),
    );
    await runService(layer, ({ db }) => insertAlias(db, "2328926", "geonames", place.id));
    await runService(layer, ({ db }) => insertAlias(db, "NG", "iso", place.id));

    const resolved = await runService(layer, ({ places }) => places.resolve({ place: "nigeria" }));
    expect(resolved).not.toBeNull();
    expect(resolved?.place).toMatchObject({
      id: place.id,
      slug: "nigeria",
      name: "Nigeria",
      parentId: null,
      label: "country",
    });
    expect(resolved?.aliases.sort()).toEqual(["2328926", "NG"]);
    expect(resolved?.community).toBeNull();
  });

  it("resolve accepts geonames and iso aliases, bare or prefixed", async () => {
    const layer = freshLayer();
    const place = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "nigeria", name: "Nigeria" }),
    );
    await runService(layer, ({ db }) => insertAlias(db, "2328926", "geonames", place.id));
    await runService(layer, ({ db }) => insertAlias(db, "NG", "iso", place.id));
    await runService(layer, ({ db }) => insertAlias(db, "NGA", "iso", place.id));

    for (const input of ["2328926", "geonames:2328926", "GEONAMES:2328926", "ng", "NG", "nga"]) {
      const resolved = await runService(layer, ({ places }) => places.resolve({ place: input }));
      expect(resolved?.place.id, `input ${input}`).toBe(place.id);
    }
  });

  it("resolve returns null for an unknown place", async () => {
    const layer = freshLayer();
    expect(
      await runService(layer, ({ places }) => places.resolve({ place: "atlantis" })),
    ).toBeNull();
  });

  it("resolve carries community status with member count", async () => {
    const layer = freshLayer();
    const place = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "nigeria", name: "Nigeria" }),
    );
    await runService(layer, ({ db }) =>
      db.insert(nodesTable).values({
        slug: "nigeria",
        name: "Nigeria",
        placeId: place.id,
        orgId: "org-nigeria",
        activatedAt: new Date("2026-01-15T00:00:00Z"),
        activatedBy: "user-1",
      }),
    );
    await runService(layer, ({ db }) =>
      db.insert(memberCountObservations).values({
        organizationId: "org-nigeria",
        count: 47,
        observedAt: new Date("2026-02-01T00:00:00Z"),
      }),
    );

    const resolved = await runService(layer, ({ places }) => places.resolve({ place: "nigeria" }));
    expect(resolved?.community).toEqual({
      nodeId: expect.any(String),
      activatedAt: "2026-01-15T00:00:00.000Z",
      memberCount: 47,
    });
  });

  it("resolve without an observation reports a null memberCount", async () => {
    const layer = freshLayer();
    const place = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "nigeria", name: "Nigeria" }),
    );
    await runService(layer, ({ db }) =>
      db.insert(nodesTable).values({
        slug: "nigeria",
        name: "Nigeria",
        placeId: place.id,
        activatedAt: new Date("2026-01-15T00:00:00Z"),
      }),
    );

    const resolved = await runService(layer, ({ places }) => places.resolve({ place: "nigeria" }));
    expect(resolved?.community).toEqual({
      nodeId: expect.any(String),
      activatedAt: "2026-01-15T00:00:00.000Z",
      memberCount: null,
    });
  });

  it("resolve reports no community for a node that was never activated", async () => {
    const layer = freshLayer();
    const place = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "nigeria", name: "Nigeria" }),
    );
    await runService(layer, ({ db }) =>
      db.insert(nodesTable).values({ slug: "nigeria", name: "Nigeria", placeId: place.id }),
    );

    const resolved = await runService(layer, ({ places }) => places.resolve({ place: "nigeria" }));
    expect(resolved?.community).toBeNull();
  });

  it("children returns direct children only", async () => {
    const layer = freshLayer();
    const cis = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "cis", name: "Commonwealth of Independent States" }),
    );
    const russia = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "russia", name: "Russia", parentId: cis.id }),
    );
    await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "moscow", name: "Moscow", parentId: russia.id }),
    );

    const children = await runService(layer, ({ places }) => places.children(cis.id));
    expect(children.map((p) => p.slug)).toEqual(["russia"]);
  });

  it("ancestorIds walks up nearest-first and is self-inclusive", async () => {
    const layer = freshLayer();
    const cis = await runService(layer, ({ db }) => insertPlace(db, { slug: "cis", name: "CIS" }));
    const russia = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "russia", name: "Russia", parentId: cis.id }),
    );
    const moscow = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "moscow", name: "Moscow", parentId: russia.id }),
    );

    const chain = await runService(layer, ({ places }) => places.ancestorIds(moscow.id));
    expect(chain).toEqual([moscow.id, russia.id, cis.id]);
    expect(await runService(layer, ({ places }) => places.ancestorIds(cis.id))).toEqual([cis.id]);
  });

  it("ancestorIds terminates on a corrupt cycle instead of hanging", async () => {
    const layer = freshLayer();
    const a = await runService(layer, ({ db }) => insertPlace(db, { slug: "a", name: "A" }));
    const b = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "b", name: "B", parentId: a.id }),
    );
    await runService(layer, ({ db }) =>
      db.update(placesTable).set({ parentId: b.id }).where(eq(placesTable.id, a.id)),
    );

    const chain = await runService(layer, ({ places }) => places.ancestorIds(a.id));
    expect(chain[0]).toBe(a.id);
    expect(new Set(chain).size).toBe(chain.length);
  });

  it("subtreeIds includes self and all descendants", async () => {
    const layer = freshLayer();
    const cis = await runService(layer, ({ db }) => insertPlace(db, { slug: "cis", name: "CIS" }));
    const russia = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "russia", name: "Russia", parentId: cis.id }),
    );
    const moscow = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "moscow", name: "Moscow", parentId: russia.id }),
    );
    const kenya = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "kenya", name: "Kenya" }),
    );

    const subtree = await runService(layer, ({ places }) => places.subtreeIds(cis.id));
    expect(new Set(subtree)).toEqual(new Set([cis.id, russia.id, moscow.id]));
    expect(subtree).not.toContain(kenya.id);
  });

  it("roots lists parent-null places only", async () => {
    const layer = freshLayer();
    const cis = await runService(layer, ({ db }) => insertPlace(db, { slug: "cis", name: "CIS" }));
    await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "russia", name: "Russia", parentId: cis.id }),
    );

    const roots = await runService(layer, ({ places }) => places.roots());
    expect(roots.map((p) => p.slug)).toEqual(["cis"]);
  });

  it("boundary returns only the boundary geometry", async () => {
    const layer = freshLayer();
    const boundary = {
      type: "Polygon" as const,
      coordinates: [
        [
          [0, 0],
          [0, 1],
          [1, 1],
          [0, 0],
        ],
      ],
    };
    const place = await runService(layer, ({ db }) =>
      insertPlace(db, { slug: "nigeria", name: "Nigeria" }),
    );
    await runService(layer, ({ db }) =>
      db.update(placesTable).set({ boundary }).where(eq(placesTable.id, place.id)),
    );

    expect(await runService(layer, ({ places }) => places.boundary(place.id))).toEqual(boundary);
    expect((await runService(layer, ({ places }) => places.getById(place.id)))?.slug).toBe(
      "nigeria",
    );
    expect(
      await runService(layer, ({ places }) =>
        places.boundary("00000000-0000-0000-0000-000000000000"),
      ),
    ).toBeNull();
  });

  it("rejects a second place claiming an occupied slug", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db }) => insertPlace(db, { slug: "nigeria", name: "Nigeria" }));

    const error = await squashServiceError(layer, ({ db }) =>
      insertPlace(db, { slug: "nigeria", name: "Nigeria Again" }),
    );
    expect(error).toBeInstanceOf(Error);
  });
});
