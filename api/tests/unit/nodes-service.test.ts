import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import { eq, sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import type { Database, DatabaseError } from "@/db";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import { nodes as nodesTable, placeAliases, places as placesTable } from "@/db/schema";
import { NodesLive, type NodesService, NodesTag } from "@/services/nodes";
import { TenantsLive, type TenantsService, TenantsTag } from "@/services/tenants";
import { createServiceHarness } from "./test-harness";

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

function freshLayer(): Layer.Layer<NodesTag | TenantsTag, DatabaseError, never> {
  const dir = mkdtempSync(join(tmpdir(), "api-nodes-"));
  activeDir = dir;
  const database = DatabaseLive(`pglite:${dir}`);
  return Layer.mergeAll(
    NodesLive.pipe(Layer.provide(database)),
    TenantsLive.pipe(Layer.provide(database)),
    database,
  ).pipe(Layer.provide(Layer.succeed(PluginIdTag, "api"))) as Layer.Layer<
    NodesTag | TenantsTag | DatabaseTag,
    DatabaseError,
    never
  >;
}

async function seedPlace(db: Database, slug: string, parentId?: string | null) {
  const [row] = await db
    .insert(placesTable)
    .values({ slug, name: slug, parentId: parentId ?? null })
    .onConflictDoUpdate({
      target: placesTable.slug,
      set: parentId === undefined ? { slug: sql`excluded.slug` } : { parentId: parentId ?? null },
    })
    .returning();
  if (!row) throw new Error("place insert returned no row");
  return row;
}

async function linkNodeToPlace(db: Database, nodeId: string, placeId: string) {
  await db.update(nodesTable).set({ placeId }).where(eq(nodesTable.id, nodeId));
}

const MISSING_ID = "00000000-0000-0000-0000-000000000000";

interface TestServices {
  nodes: NodesService;
  tenants: TenantsService;
  db: Database;
}

const { run: runService, squashError: squashServiceError } = createServiceHarness<
  TestServices,
  NodesTag | TenantsTag | DatabaseTag,
  DatabaseError,
  Error
>(
  Effect.gen(function* () {
    return { nodes: yield* NodesTag, tenants: yield* TenantsTag, db: yield* DatabaseTag };
  }),
);

function seedTenant(tenants: TenantsService) {
  return Effect.gen(function* () {
    const tenant = yield* tenants.createTenant({
      name: "Test Tenant",
      accountId: "test.example.near",
      orgId: "org-1",
    });
    return tenant.id;
  });
}

async function seedPlaceWithNode(
  db: Database,
  options: { placeSlug: string; placeParentSlug?: string | null; nodeSlug?: string },
) {
  const parentPlace = options.placeParentSlug ? await seedPlace(db, options.placeParentSlug) : null;
  const place = await seedPlace(db, options.placeSlug, parentPlace?.id ?? null);
  const [node] = await db
    .insert(nodesTable)
    .values({
      slug: options.nodeSlug ?? options.placeSlug,
      name: options.placeSlug,
      placeId: place.id,
      activatedAt: new Date(),
    })
    .returning();
  if (!node) throw new Error("node insert returned no row");
  await linkNodeToPlace(db, node.id, place.id);
  return { place, node };
}

describe("NodesService", () => {
  it("updates a node without touching the place hierarchy", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const { node } = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "nigeria", nodeSlug: "nigeria" }),
        );

        const updated = yield* nodes.update(node.id, { name: "Nigeria (renamed)" });
        expect(updated.name).toBe("Nigeria (renamed)");
        expect(updated.placeId).toBe(node.placeId);
      }),
    );
  });

  it("rejects moving a City Node below its descendant without changing its subtree", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));
    const root = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "country",
        slug: "root",
        name: "Root",
        parentId: null,
        tenantId,
      }),
    );
    const child = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "state",
        slug: "child",
        name: "Child",
        parentId: root.id,
        tenantId,
      }),
    );
    const leaf = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "city",
        slug: "leaf",
        name: "Leaf",
        parentId: child.id,
        tenantId,
      }),
    );

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.update(root.id, { parentId: leaf.id }),
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("BAD_REQUEST");
    expect((await runService(layer, ({ nodes }) => nodes.getById(root.id)))?.parentId).toBeNull();
    expect((await runService(layer, ({ nodes }) => nodes.getById(child.id)))?.parentId).toBe(
      root.id,
    );
    await expect(
      runService(layer, ({ nodes }) => nodes.update(leaf.id, { parentId: root.id })),
    ).resolves.toMatchObject({ parentId: root.id });
  });

  it("does not allow opposite reparenting requests to create a cycle", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));
    const a = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "country",
        slug: "a",
        name: "A",
        parentId: null,
        tenantId,
      }),
    );
    const b = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "country",
        slug: "b",
        name: "B",
        parentId: null,
        tenantId,
      }),
    );
    const results = await Promise.allSettled([
      runService(layer, ({ nodes }) => nodes.update(a.id, { parentId: b.id })),
      runService(layer, ({ nodes }) => nodes.update(b.id, { parentId: a.id })),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const updatedA = await runService(layer, ({ nodes }) => nodes.getById(a.id));
    const updatedB = await runService(layer, ({ nodes }) => nodes.getById(b.id));
    expect(updatedA?.parentId === b.id && updatedB?.parentId === a.id).toBe(false);
  });

  it("rejects self-parent on update", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));
    const node = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "country",
        slug: "usa",
        name: "USA",
        parentId: null,
        tenantId,
      }),
    );

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.update(node.id, { parentId: node.id }),
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("BAD_REQUEST");
  });

  it("fails with NOT_FOUND when moving to a missing parent", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));
    const node = await runService(layer, ({ nodes }) =>
      nodes.spawn({ kind: "city", slug: "movable", name: "Movable", parentId: null, tenantId }),
    );

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.update(node.id, { parentId: MISSING_ID }),
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
  });

  it("creates and resolves a node by id", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));

    const node = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "country",
        slug: "usa",
        name: "United States",
        parentId: null,
        tenantId,
      }),
    );

    expect(node).toMatchObject({
      kind: "country",
      slug: "usa",
      name: "United States",
      parentId: null,
      tenantId,
      metadata: {},
    });
    expect(node.id).toEqual(expect.any(String));
    expect(node.createdAt).toEqual(expect.any(String));

    const resolved = await runService(layer, ({ nodes }) => nodes.getById(node.id));
    expect(resolved?.id).toBe(node.id);
  });

  it("persists metadata JSONB", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));

    const node = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "city",
        slug: "chicago",
        name: "Chicago",
        parentId: null,
        tenantId,
        metadata: { population: 2_700_000, region: "midwest" },
      }),
    );
    expect(node.metadata).toEqual({ kind: "city", population: 2_700_000, region: "midwest" });

    const updated = await runService(layer, ({ nodes }) =>
      nodes.update(node.id, { metadata: { population: 2_800_000 } }),
    );
    expect(updated.metadata).toEqual({ kind: "city", population: 2_800_000 });
  });

  it("treats an explicit kind argument as authoritative over metadata.kind", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));

    const node = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "org",
        slug: "kind-wins",
        name: "Kind Wins",
        parentId: null,
        tenantId,
        metadata: { kind: "user" },
      }),
    );
    expect(node.kind).toBe("org");
    expect(node.metadata).toEqual({ kind: "org" });

    const updated = await runService(layer, ({ nodes }) => nodes.update(node.id, { kind: "zone" }));
    expect(updated.kind).toBe("zone");
    expect(updated.metadata).toEqual({ kind: "zone" });

    const relabeled = await runService(layer, ({ nodes }) =>
      nodes.update(node.id, { metadata: { kind: "user" } }),
    );
    expect(relabeled.kind).toBe("user");
  });

  it("rejects an invalid slug", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "city",
        slug: "Invalid Slug!",
        name: "Bad",
        parentId: null,
        tenantId,
      }),
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("BAD_REQUEST");
  });

  it("fails with NOT_FOUND when creating with a missing tenant", async () => {
    const layer = freshLayer();

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "country",
        slug: "ghost",
        name: "Ghost",
        parentId: null,
        tenantId: MISSING_ID,
      }),
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
  });

  it("fails with NOT_FOUND when parentId is set but the parent doesn't exist", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "city",
        slug: "chicago",
        name: "Chicago",
        parentId: MISSING_ID,
        tenantId,
      }),
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
  });

  it("listRootNodes lists nodes whose places have no parent", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        yield* Effect.tryPromise(() => seedPlaceWithNode(db, { placeSlug: "usa" }));
        yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "illinois", placeParentSlug: "usa" }),
        );

        const roots = yield* nodes.listRootNodes;
        expect(roots.map((n) => n.slug)).toEqual(["usa"]);
      }),
    );
  });

  it("listSummaries counts children through the places tree", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const usa = yield* Effect.tryPromise(() => seedPlaceWithNode(db, { placeSlug: "usa" }));
        yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "illinois", placeParentSlug: "usa" }),
        );

        const summaries = yield* nodes.listSummaries({ parentId: null });
        expect(summaries).toEqual([
          {
            node: expect.objectContaining({ slug: "usa", placeId: usa.place.id }),
            childrenCount: 1,
            validatorCount: 0,
          },
        ]);
      }),
    );
  });

  it("listChildren returns direct children only, via the places tree", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const usa = yield* Effect.tryPromise(() => seedPlaceWithNode(db, { placeSlug: "usa" }));
        const illinois = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "illinois", placeParentSlug: "usa" }),
        );
        yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "chicago", placeParentSlug: "illinois" }),
        );

        const usaChildren = yield* nodes.listChildren(usa.node.id);
        expect(usaChildren.map((n) => n.slug)).toEqual(["illinois"]);

        const illinoisChildren = yield* nodes.listChildren(illinois.node.id);
        expect(illinoisChildren.map((n) => n.slug)).toEqual(["chicago"]);
      }),
    );
  });

  it("detaching a linked node leaves the shared place hierarchy alone", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const { place, node } = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "kazakhstan", placeParentSlug: "cis" }),
        );

        yield* nodes.update(node.id, { parentId: null });

        const [after] = yield* Effect.tryPromise(() =>
          db.select().from(placesTable).where(eq(placesTable.id, place.id)),
        );
        expect(after?.parentId).toBe(place.parentId);
      }),
    );
  });

  it("listSummaries counts child nodes, not catalog places without a community", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const usa = yield* Effect.tryPromise(() => seedPlaceWithNode(db, { placeSlug: "usa" }));
        yield* Effect.tryPromise(() => seedPlace(db, "texas", usa.place.id));
        yield* Effect.tryPromise(() => seedPlace(db, "ohio", usa.place.id));
        yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "illinois", placeParentSlug: "usa" }),
        );

        const [summary] = yield* nodes.listSummaries({ parentId: null });
        expect(summary?.childrenCount).toBe(1);
      }),
    );
  });

  it("rolls linked nodes up to the nearest ancestor place with a community", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const usa = yield* Effect.tryPromise(() => seedPlaceWithNode(db, { placeSlug: "usa" }));
        const illinois = yield* Effect.tryPromise(() => seedPlace(db, "illinois", usa.place.id));
        const chicago = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "chicago", placeParentSlug: "illinois" }),
        );
        const kazakhstan = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "kazakhstan", placeParentSlug: "cis" }),
        );

        expect(illinois.parentId).toBe(usa.place.id);
        const roots = yield* nodes.listRootNodes;
        expect(roots.map((n) => n.slug).sort()).toEqual(["kazakhstan", "usa"]);
        expect((yield* nodes.list({ parentId: null })).map((n) => n.slug).sort()).toEqual([
          "kazakhstan",
          "usa",
        ]);
        expect((yield* nodes.listChildren(usa.node.id)).map((n) => n.id)).toEqual([
          chicago.node.id,
        ]);
        const summaries = yield* nodes.listSummaries({ parentId: null });
        expect(summaries.find((s) => s.node.id === usa.node.id)?.childrenCount).toBe(1);
        expect(summaries.find((s) => s.node.id === kazakhstan.node.id)?.childrenCount).toBe(0);
        const subtree = yield* nodes.subtreeWithValidators(usa.node.id);
        expect(subtree.map((n) => n.slug)).toEqual(["usa", "chicago"]);
      }),
    );
  });

  it("resolveBySlug finds nodes by place slug and legacy alias", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const { node } = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "nigeria", nodeSlug: "nigeria-node" }),
        );
        yield* Effect.tryPromise(() =>
          db
            .insert(placeAliases)
            .values({ value: "nigeria-node", kind: "legacy", placeId: node.placeId! }),
        );

        expect((yield* nodes.resolveBySlug("nigeria"))?.id).toBe(node.id);
        expect((yield* nodes.resolveBySlug("nigeria-node"))?.id).toBe(node.id);
        expect(yield* nodes.resolveBySlug("atlantis")).toBeNull();
      }),
    );
  });

  it("deletes a node", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));
    const node = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "city",
        slug: "chicago",
        name: "Chicago",
        parentId: null,
        tenantId,
      }),
    );

    expect(await runService(layer, ({ nodes }) => nodes.delete(node.id))).toBe(true);
    expect(await runService(layer, ({ nodes }) => nodes.delete(node.id))).toBe(false);
    expect(await runService(layer, ({ nodes }) => nodes.getById(node.id))).toBeNull();
  });

  it("setBulletin merges into metadata without clobbering other keys", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));

    const node = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "city",
        slug: "chicago",
        name: "Chicago",
        parentId: null,
        tenantId,
        metadata: { poolAccountId: "chicago-pool.poolv1.near" },
      }),
    );

    const withBulletin = await runService(layer, ({ nodes }) =>
      nodes.setBulletin(node.id, "More features are coming soon."),
    );
    expect(withBulletin.metadata).toEqual({
      kind: "city",
      poolAccountId: "chicago-pool.poolv1.near",
      bulletin: "More features are coming soon.",
    });

    const cleared = await runService(layer, ({ nodes }) => nodes.setBulletin(node.id, null));
    expect(cleared.metadata).toEqual({
      kind: "city",
      poolAccountId: "chicago-pool.poolv1.near",
    });
  });

  it("setBulletin fails with NOT_FOUND for a missing node", async () => {
    const layer = freshLayer();

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.setBulletin(MISSING_ID, "hi"),
    );
    expect(error).toBeInstanceOf(ORPCError);
    expect((error as ORPCError<string, unknown>).code).toBe("NOT_FOUND");
  });

  it("list filters by kind and by parent node through the places tree", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const usa = yield* Effect.tryPromise(() => seedPlaceWithNode(db, { placeSlug: "usa" }));
        const illinois = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, {
            placeSlug: "illinois",
            placeParentSlug: "usa",
            nodeSlug: "illinois",
          }),
        );
        const newYork = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, {
            placeSlug: "new-york",
            placeParentSlug: "usa",
            nodeSlug: "new-york",
          }),
        );

        yield* nodes.update(illinois.node.id, { kind: "state" });
        yield* nodes.update(newYork.node.id, { kind: "state" });

        const statesUnderUsa = yield* nodes.list({ kind: "state", parentId: usa.node.id });
        expect(statesUnderUsa.map((n) => n.slug).sort()).toEqual(["illinois", "new-york"]);

        const roots = yield* nodes.list({ parentId: null });
        expect(roots.map((n) => n.slug)).toEqual(["usa"]);
      }),
    );
  });

  it("listAncestors walks the places tree nearest first, skipping places without a community", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const usa = yield* Effect.tryPromise(() => seedPlaceWithNode(db, { placeSlug: "usa" }));
        const illinois = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "illinois", placeParentSlug: "usa" }),
        );
        const chicago = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "chicago", placeParentSlug: "illinois" }),
        );
        const malaysia = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "malaysia" }),
        );
        yield* Effect.tryPromise(() => seedPlace(db, "selangor", malaysia.place.id));
        const kualaLumpur = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "kuala-lumpur", placeParentSlug: "selangor" }),
        );

        const chicagoChain = yield* nodes.listAncestors(chicago.node.id);
        expect(chicagoChain.map((n) => n.id)).toEqual([illinois.node.id, usa.node.id]);

        const klChain = yield* nodes.listAncestors(kualaLumpur.node.id);
        expect(klChain.map((n) => n.id)).toEqual([malaysia.node.id]);

        expect(yield* nodes.listAncestors(usa.node.id)).toEqual([]);
        expect(yield* nodes.listAncestors(MISSING_ID)).toEqual([]);
      }),
    );
  });

  it("listAncestors follows the legacy parent for nodes without a place", async () => {
    const layer = freshLayer();
    await runService(layer, ({ nodes, tenants }) =>
      Effect.gen(function* () {
        const tenantId = yield* seedTenant(tenants);
        const country = yield* nodes.spawn({
          kind: "country",
          slug: "testland",
          name: "Testland",
          parentId: null,
          tenantId,
        });
        const city = yield* nodes.spawn({
          kind: "city",
          slug: "alpha",
          name: "Alpha",
          parentId: country.id,
          tenantId,
        });

        const chain = yield* nodes.listAncestors(city.id);
        expect(chain.map((n) => n.id)).toEqual([country.id]);
      }),
    );
  });
});
