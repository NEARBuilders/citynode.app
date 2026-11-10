import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import {
  nodes as nodesTable,
  placeAliases,
  places as placesTable,
  tenants as tenantsTable,
} from "@/db/schema";
import {
  applyBackfill,
  type BackfillInputs,
  type BackfillNode,
  buildBackfillPlan,
  type ExistingPlace,
} from "@/seed/backfill-node-places";
import { createTempDb } from "./test-harness";

let cleanup: (() => void) | null = null;

afterEach(() => {
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
});

const NIGERIA_BOUNDARY = {
  type: "Polygon" as const,
  coordinates: [
    [
      [2.7, 6.3],
      [14, 6.3],
      [14, 13.9],
      [2.7, 13.9],
      [2.7, 6.3],
    ],
  ],
};

function node(fixture: Partial<BackfillNode> & { id: string; slug: string }): BackfillNode {
  return {
    name: fixture.slug,
    parentId: null,
    tenantOrgId: null,
    label: null,
    createdAt: "2025-06-01T00:00:00.000Z",
    ...fixture,
  };
}

function place(fixture: Partial<ExistingPlace> & { id: string; slug: string }): ExistingPlace {
  return {
    name: fixture.slug,
    parentId: null,
    boundary: null,
    ...fixture,
  };
}

const baseInputs: BackfillInputs = {
  nodes: [],
  places: [],
  aliases: [],
  geoByNodeId: {},
};

describe("buildBackfillPlan", () => {
  it("curates an unmatched node with its own slug byte-for-byte and carries discovery geo", () => {
    const plan = buildBackfillPlan({
      ...baseInputs,
      nodes: [node({ id: "n1", slug: "springfield", name: "Springfield", label: "city" })],
      geoByNodeId: {
        n1: { latitude: 39.78, longitude: -89.65, boundary: NIGERIA_BOUNDARY },
      },
    });

    expect(plan.curated).toHaveLength(1);
    expect(plan.curated[0]).toMatchObject({
      slug: "springfield",
      name: "Springfield",
      label: "city",
      latitude: 39.78,
      longitude: -89.65,
      boundary: NIGERIA_BOUNDARY,
      parentSlug: null,
    });
    expect(plan.nodeLinks[0]).toMatchObject({
      nodeId: "n1",
      placeSlug: "springfield",
      orgId: null,
      legacyAlias: null,
    });
  });

  it("matches a node by exact slug and links without a legacy alias", () => {
    const plan = buildBackfillPlan({
      ...baseInputs,
      nodes: [node({ id: "n1", slug: "nigeria", name: "Nigeria" })],
      places: [place({ id: "p1", slug: "nigeria", name: "Nigeria", boundary: NIGERIA_BOUNDARY })],
    });

    expect(plan.curated).toHaveLength(0);
    expect(plan.nodeLinks[0]).toMatchObject({
      nodeId: "n1",
      placeSlug: "nigeria",
      legacyAlias: null,
    });
  });

  it("matches by normalized node name and plans a legacy alias when slugs differ", () => {
    const plan = buildBackfillPlan({
      ...baseInputs,
      nodes: [node({ id: "n1", slug: "nigeria-node", name: "Nigeria" })],
      places: [place({ id: "p1", slug: "nigeria", name: "Nigeria" })],
    });

    expect(plan.nodeLinks[0]).toMatchObject({
      nodeId: "n1",
      placeSlug: "nigeria",
      legacyAlias: "nigeria-node",
    });
  });

  it("matches by discovery geo containment, preferring the deepest place", () => {
    const plan = buildBackfillPlan({
      ...baseInputs,
      nodes: [
        node({ id: "cis-node", slug: "cis-node", name: "CIS Node" }),
        node({ id: "village", slug: "village", name: "Somewhere Village" }),
      ],
      places: [
        place({ id: "p-cis", slug: "cis", name: "Commonwealth of Independent States" }),
        place({ id: "p-russia", slug: "russia", name: "Russia", parentId: "p-cis" }),
        place({
          id: "p-moscow",
          slug: "ru-moscow",
          name: "Moscow",
          parentId: "p-russia",
          boundary: {
            type: "Polygon",
            coordinates: [
              [
                [37.3, 55.4],
                [37.9, 55.4],
                [37.9, 56.0],
                [37.3, 56.0],
                [37.3, 55.4],
              ],
            ],
          },
        }),
      ],
      aliases: [{ value: "524894", placeId: "p-moscow" }],
      geoByNodeId: {
        "cis-node": { latitude: 0, longitude: 0, boundary: null },
        village: { latitude: 55.75, longitude: 37.6, boundary: null },
      },
    });

    const links = new Map(plan.nodeLinks.map((link) => [link.nodeId, link.placeSlug] as const));
    expect(links.get("village")).toBe("ru-moscow");
    expect(links.get("cis-node")).toBe("cis-node");
    expect(plan.curated.find((p) => p.slug === "cis-node")).toMatchObject({ parentSlug: null });
  });

  it("chains curated parents through the parent node's planned place", () => {
    const plan = buildBackfillPlan({
      ...baseInputs,
      nodes: [
        node({ id: "parent", slug: "legacy-state", name: "Legacy State", label: "state" }),
        node({
          id: "child",
          slug: "legacy-city",
          name: "Legacy City",
          label: "city",
          parentId: "parent",
        }),
      ],
    });

    expect(plan.curated.map((p) => p.slug).sort()).toEqual(["legacy-city", "legacy-state"]);
    expect(plan.curated.find((p) => p.slug === "legacy-city")?.parentSlug).toBe("legacy-state");
    expect(plan.curated.find((p) => p.slug === "legacy-state")?.label).toBe("subdivision");
  });

  it("passes org and activation data into node links", () => {
    const plan = buildBackfillPlan({
      ...baseInputs,
      nodes: [
        node({
          id: "n1",
          slug: "nigeria",
          name: "Nigeria",
          tenantOrgId: "org-nigeria",
          createdAt: "2025-01-15T00:00:00.000Z",
        }),
      ],
      places: [place({ id: "p1", slug: "nigeria", name: "Nigeria" })],
    });

    expect(plan.nodeLinks[0]).toMatchObject({
      orgId: "org-nigeria",
      activatedAt: "2025-01-15T00:00:00.000Z",
    });
  });
});

describe("applyBackfill", () => {
  it("seeds curated places, links nodes, and is idempotent", async () => {
    const temp = createTempDb("api-backfill-");
    cleanup = temp.cleanup;
    const layer = Layer.mergeAll(DatabaseLive(temp.url)).pipe(
      Layer.provide(Layer.succeed(PluginIdTag, "api")),
    );

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseTag;
        yield* Effect.tryPromise(() =>
          db.insert(tenantsTable).values({
            id: "11111111-1111-4111-8111-111111111111",
            accountId: "t1.near",
            name: "T1",
            orgId: "org-nigeria",
          }),
        );
        yield* Effect.tryPromise(() =>
          db.insert(nodesTable).values({
            id: "22222222-2222-4222-8222-222222222222",
            slug: "nigeria",
            name: "Nigeria",
            tenantId: "11111111-1111-4111-8111-111111111111",
            metadata: { kind: "country" },
          }),
        );
        const plan = buildBackfillPlan({
          ...baseInputs,
          nodes: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              slug: "nigeria",
              name: "Nigeria",
              parentId: null,
              tenantOrgId: "org-nigeria",
              label: "country",
              createdAt: "2025-01-15T00:00:00.000Z",
            },
          ],
        });
        yield* Effect.tryPromise(() => applyBackfill(db, plan));
        yield* Effect.tryPromise(() => applyBackfill(db, plan));

        const placeRows = yield* Effect.tryPromise(() => db.select().from(placesTable));
        const nodeRows = yield* Effect.tryPromise(() => db.select().from(nodesTable));
        const aliasRows = yield* Effect.tryPromise(() => db.select().from(placeAliases));
        return { placeRows, nodeRows, aliasRows };
      }).pipe(Effect.provide(layer)),
    );

    expect(outcome.placeRows).toHaveLength(1);
    expect(outcome.aliasRows).toHaveLength(0);
    expect(outcome.nodeRows[0]).toMatchObject({
      placeId: outcome.placeRows[0]?.id,
      orgId: "org-nigeria",
      activatedAt: expect.any(Date),
    });
  });

  it("links a node onto an existing catalog place by slug", async () => {
    const temp = createTempDb("api-backfill-2-");
    cleanup = temp.cleanup;
    const layer = Layer.mergeAll(DatabaseLive(temp.url)).pipe(
      Layer.provide(Layer.succeed(PluginIdTag, "api")),
    );

    const nodeRows = await Effect.runPromise(
      Effect.gen(function* () {
        const db = yield* DatabaseTag;
        yield* Effect.tryPromise(() =>
          db.insert(placesTable).values({ slug: "nigeria", name: "Nigeria", label: "country" }),
        );
        yield* Effect.tryPromise(() =>
          db.insert(nodesTable).values({
            id: "33333333-3333-4333-8333-333333333333",
            slug: "nigeria",
            name: "Nigeria",
          }),
        );
        const plan = buildBackfillPlan({
          ...baseInputs,
          nodes: [
            {
              id: "33333333-3333-4333-8333-333333333333",
              slug: "nigeria",
              name: "Nigeria",
              parentId: null,
              tenantOrgId: "org-nigeria",
              label: "country",
              createdAt: "2025-01-15T00:00:00.000Z",
            },
          ],
          places: yield* Effect.tryPromise(() =>
            db
              .select({
                id: placesTable.id,
                slug: placesTable.slug,
                name: placesTable.name,
                parentId: placesTable.parentId,
                boundary: placesTable.boundary,
              })
              .from(placesTable),
          ),
        });
        yield* Effect.tryPromise(() => applyBackfill(db, plan));
        return yield* Effect.tryPromise(() => db.select().from(nodesTable));
      }).pipe(Effect.provide(layer)),
    );

    expect(nodeRows[0]?.placeId).not.toBeNull();
    expect(nodeRows[0]?.orgId).toBe("org-nigeria");
  });
});
