import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import type { Database, DatabaseError } from "@/db";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import { nodes as nodesTable, placeAliases, places as placesTable } from "@/db/schema";
import { hasJoinCode, NodesLive, type NodesService, NodesTag } from "@/services/nodes";
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

const MISSING_ID = "00000000-0000-0000-0000-000000000000";
const PUBLISHER = { userId: "user-1", name: "Ada" };

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
  options: { placeSlug: string; placeParentSlug?: string | null },
) {
  const parentPlace = options.placeParentSlug ? await seedPlace(db, options.placeParentSlug) : null;
  const place = await seedPlace(db, options.placeSlug, parentPlace?.id ?? null);
  const [node] = await db
    .insert(nodesTable)
    .values({ placeId: place.id, activatedAt: new Date() })
    .returning();
  if (!node) throw new Error("node insert returned no row");
  return { place, node };
}

describe("NodesService", () => {
  it("gives a started community its own placeholder tenant, and a fresh one when restarted", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes, tenants }) =>
      Effect.gen(function* () {
        const place = yield* Effect.tryPromise(() => seedPlace(db, "kuala-lumpur"));
        const first = yield* nodes.activateForPlace({
          placeId: place.id,
          orgId: "org-first",
          activatedBy: "user-1",
          joinCodeId: "join-first",
        });
        expect(first.created).toBe(true);
        const tenant = yield* tenants.resolveTenantById(first.node.tenantId!);
        expect(tenant).toMatchObject({
          accountId: "kuala-lumpur.v1.citynode.near",
          orgId: "org-first",
          name: "kuala-lumpur",
          ownerKind: "platform",
          allowUiOverrides: false,
        });

        const again = yield* nodes.activateForPlace({
          placeId: place.id,
          orgId: "org-other",
          activatedBy: "user-2",
          joinCodeId: "join-other",
        });
        expect(again).toMatchObject({ created: false, node: { tenantId: tenant!.id } });

        expect(yield* nodes.delete(first.node.id)).toBe(true);
        const restarted = yield* nodes.activateForPlace({
          placeId: place.id,
          orgId: "org-second",
          activatedBy: "user-3",
          joinCodeId: "join-second",
        });
        expect(restarted.node.tenantId).not.toBe(tenant!.id);
        expect(yield* tenants.resolveTenantById(restarted.node.tenantId!)).toMatchObject({
          accountId: "kuala-lumpur.v1.citynode.near",
          orgId: "org-second",
          status: "active",
          deletedAt: null,
        });
        const archived = yield* tenants.resolveTenantById(tenant!.id);
        expect(archived).toMatchObject({
          accountId: `archived-${tenant!.id}.v1.citynode.near`,
          orgId: "org-first",
          status: "pending_deletion",
        });
        expect(archived?.deletedAt).toEqual(expect.any(String));
      }),
    );
  });

  it("archives a suspended placeholder without reviving it, and leaves other tenants alone", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes, tenants }) =>
      Effect.gen(function* () {
        const place = yield* Effect.tryPromise(() => seedPlace(db, "penang"));
        const started = yield* nodes.activateForPlace({
          placeId: place.id,
          orgId: "org-penang",
          activatedBy: "user-1",
          joinCodeId: "join-penang",
        });
        const placeholderId = started.node.tenantId!;
        yield* tenants.updateTenant(placeholderId, { status: "suspended" });
        expect(yield* nodes.delete(started.node.id)).toBe(true);
        expect(yield* tenants.resolveTenantById(placeholderId)).toMatchObject({
          accountId: `archived-${placeholderId}.v1.citynode.near`,
          status: "pending_deletion",
        });

        const daoTenant = yield* tenants.createTenant({
          name: "DAO city",
          accountId: "dao-city.sputnik-dao.near",
          orgId: "org-dao",
          ownerKind: "dao",
        });
        const daoNode = yield* nodes.spawn({ tenantId: daoTenant.id });
        expect(yield* nodes.delete(daoNode.id)).toBe(true);
        expect(yield* tenants.resolveTenantById(daoTenant.id)).toMatchObject({
          accountId: "dao-city.sputnik-dao.near",
          status: "active",
          deletedAt: null,
        });
      }),
    );
  });

  it("refuses to start a community whose placeholder account is already taken", async () => {
    const layer = freshLayer();
    const error = await squashServiceError(layer, ({ db, nodes, tenants }) =>
      Effect.gen(function* () {
        const place = yield* Effect.tryPromise(() => seedPlace(db, "taken"));
        const other = yield* tenants.createTenant({
          name: "Other",
          accountId: "taken.v1.citynode.near",
          orgId: "org-other",
        });
        yield* nodes.spawn({ tenantId: other.id });
        return yield* nodes.activateForPlace({
          placeId: place.id,
          orgId: "org-new",
          activatedBy: "user-1",
          joinCodeId: "join-new",
        });
      }),
    );
    expect((error as ORPCError<string, unknown>).code).toBe("CONFLICT");
  });

  it("updates a node without touching the place hierarchy", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const { node } = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, { placeSlug: "nigeria" }),
        );

        const updated = yield* nodes.update(node.id, { metadata: { note: "renamed" } });
        expect(updated).toMatchObject({
          name: "nigeria",
          slug: "nigeria",
          parentId: null,
          placeId: node.placeId,
          metadata: { note: "renamed" },
        });
      }),
    );
  });

  it("creates and resolves a node by id", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, ({ tenants }) => seedTenant(tenants));

    const node = await runService(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "country",
        tenantId,
      }),
    );

    expect(node).toMatchObject({
      kind: "country",
      slug: node.id,
      name: "Test Tenant",
      parentId: null,
      placeId: null,
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

  it("fails with NOT_FOUND when creating with a missing tenant", async () => {
    const layer = freshLayer();

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.spawn({
        kind: "country",
        tenantId: MISSING_ID,
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
          seedPlaceWithNode(db, { placeSlug: "nigeria" }),
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
        tenantId,
        metadata: { poolAccountId: "chicago-pool.poolv1.near" },
      }),
    );

    const withBulletin = await runService(layer, ({ nodes }) =>
      nodes.setBulletin(node.id, "More features are coming soon.", PUBLISHER),
    );
    expect(withBulletin.metadata).toEqual({
      kind: "city",
      poolAccountId: "chicago-pool.poolv1.near",
      bulletin: "More features are coming soon.",
    });

    const cleared = await runService(layer, ({ nodes }) =>
      nodes.setBulletin(node.id, null, PUBLISHER),
    );
    expect(cleared.metadata).toEqual({
      kind: "city",
      poolAccountId: "chicago-pool.poolv1.near",
    });
  });

  it("setBulletin fails with NOT_FOUND for a missing node", async () => {
    const layer = freshLayer();

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.setBulletin(MISSING_ID, "hi", PUBLISHER),
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
          }),
        );
        const newYork = yield* Effect.tryPromise(() =>
          seedPlaceWithNode(db, {
            placeSlug: "new-york",
            placeParentSlug: "usa",
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
        expect(chicagoChain.map((n) => [n.slug, n.name])).toEqual([
          ["illinois", "illinois"],
          ["usa", "usa"],
        ]);

        const klChain = yield* nodes.listAncestors(kualaLumpur.node.id);
        expect(klChain.map((n) => n.id)).toEqual([malaysia.node.id]);

        expect(yield* nodes.listAncestors(usa.node.id)).toEqual([]);
        expect(yield* nodes.listAncestors(MISSING_ID)).toEqual([]);
      }),
    );
  });

  it("listAncestors treats a node without a place as a root", async () => {
    const layer = freshLayer();
    await runService(layer, ({ nodes, tenants }) =>
      Effect.gen(function* () {
        const tenantId = yield* seedTenant(tenants);
        const platform = yield* nodes.spawn({ kind: "platform", tenantId });

        expect(yield* nodes.listAncestors(platform.id)).toEqual([]);
      }),
    );
  });
});

describe("join codes", () => {
  it("fills a missing code once and keeps it when metadata is replaced", async () => {
    const layer = freshLayer();
    await runService(layer, ({ db, nodes }) =>
      Effect.gen(function* () {
        const chicago = yield* Effect.tryPromise(() => seedPlace(db, "chicago"));
        const platformPlace = yield* Effect.tryPromise(() => seedPlace(db, "platform-place"));
        const missing = yield* nodes.activateForPlace({
          placeId: chicago.id,
          orgId: "org-chicago",
          activatedBy: "user-1",
          joinCodeId: "",
          kind: "city",
        });
        const platform = yield* nodes.activateForPlace({
          placeId: platformPlace.id,
          orgId: "org-platform",
          activatedBy: "user-1",
          joinCodeId: "",
          kind: "platform",
        });

        expect((yield* nodes.listMissingJoinCodes()).map((node) => node.slug)).toEqual(["chicago"]);
        expect(yield* nodes.attachJoinCodeIfMissing(missing.node.id, "")).toBe(false);
        expect(yield* nodes.attachJoinCodeIfMissing(missing.node.id, "join-code-chicago")).toBe(
          true,
        );
        expect(yield* nodes.attachJoinCodeIfMissing(missing.node.id, "second-code")).toBe(false);

        const edited = yield* nodes.update(missing.node.id, {
          metadata: { bulletin: "hello", joinCodeId: "forged" },
        });
        expect(edited.metadata).toMatchObject({
          bulletin: "hello",
          joinCodeId: "join-code-chicago",
          kind: "city",
        });

        const untouched = yield* nodes.getById(platform.node.id);
        expect(untouched?.metadata.joinCodeId).toBe("");
        const forged = yield* nodes.spawn({ metadata: { joinCodeId: "forged", bulletin: "hi" } });
        expect(forged.metadata.joinCodeId).toBeUndefined();
        const replaced = yield* nodes.update(forged.id, {
          metadata: { joinCodeId: "forged", bulletin: "there" },
        });
        expect(replaced.metadata).toMatchObject({ bulletin: "there" });
        expect(replaced.metadata.joinCodeId).toBeUndefined();
      }),
    );
  });
});

describe("hasJoinCode", () => {
  it("is true only for a stored standing join code", () => {
    expect(hasJoinCode({ joinCodeId: "code-1" })).toBe(true);
    expect(hasJoinCode({ kind: "country" })).toBe(false);
    expect(hasJoinCode({ joinCodeId: "" })).toBe(false);
    expect(hasJoinCode({ joinCodeId: 42 })).toBe(false);
    expect(hasJoinCode(null)).toBe(false);
  });
});
