import type { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import type { Database, DatabaseError } from "@/db";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import { nodes as nodesTable } from "@/db/schema";
import { NodesLive, type NodesService, NodesTag } from "@/services/nodes";
import { TenantsLive, type TenantsService, TenantsTag } from "@/services/tenants";
import { createServiceHarness, createTempDb } from "./test-harness";

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

type Tags = NodesTag | TenantsTag | DatabaseTag;

function freshLayer(): Layer.Layer<Tags, DatabaseError, never> {
  const temp = createTempDb("api-bulletin-");
  cleanup = temp.cleanup;
  const database = DatabaseLive(temp.url);
  return Layer.mergeAll(
    NodesLive.pipe(Layer.provide(database)),
    TenantsLive.pipe(Layer.provide(database)),
    database,
  ).pipe(Layer.provide(Layer.succeed(PluginIdTag, "api"))) as Layer.Layer<
    Tags,
    DatabaseError,
    never
  >;
}

interface TestServices {
  nodes: NodesService;
  tenants: TenantsService;
  db: Database;
}

const { run } = createServiceHarness<TestServices, Tags, DatabaseError, ORPCError<string, unknown>>(
  Effect.gen(function* () {
    return { nodes: yield* NodesTag, tenants: yield* TenantsTag, db: yield* DatabaseTag };
  }),
);

const ADA = { userId: "user-ada", name: "Ada" };
const GRACE = { userId: "user-grace", name: "Grace" };

async function seedNode(layer: Layer.Layer<Tags, DatabaseError, never>, metadata = {}) {
  return run(layer, ({ nodes, tenants }) =>
    Effect.gen(function* () {
      const tenant = yield* tenants.createTenant({
        name: "Test Tenant",
        accountId: "test.example.near",
        orgId: "org-1",
      });
      return yield* nodes.spawn({
        kind: "city",
        slug: "nyc",
        name: "New York City",
        parentId: null,
        tenantId: tenant.id,
        metadata,
      });
    }),
  );
}

async function storedPublisher(layer: Layer.Layer<Tags, DatabaseError, never>, id: string) {
  return run(layer, async ({ db }) => {
    const [row] = await db
      .select({ userId: nodesTable.bulletinPublishedBy })
      .from(nodesTable)
      .where(eq(nodesTable.id, id));
    return row?.userId ?? null;
  });
}

describe("bulletin attribution", () => {
  it("records the publisher and date when a bulletin is set, and clears them with it", async () => {
    const layer = freshLayer();
    const node = await seedNode(layer);
    expect(node.bulletinPublishedAt).toBeNull();
    expect(node.bulletinPublisherName).toBeNull();

    const before = Date.now();
    const published = await run(layer, ({ nodes }) => nodes.setBulletin(node.id, "Hackathon", ADA));
    expect(published.bulletinPublisherName).toBe("Ada");
    expect(Date.parse(published.bulletinPublishedAt ?? "")).toBeGreaterThanOrEqual(before - 1000);
    expect(await storedPublisher(layer, node.id)).toBe("user-ada");

    const cleared = await run(layer, ({ nodes }) => nodes.setBulletin(node.id, "  ", GRACE));
    expect(cleared.metadata.bulletin).toBeUndefined();
    expect(cleared.bulletinPublishedAt).toBeNull();
    expect(cleared.bulletinPublisherName).toBeNull();
    expect(await storedPublisher(layer, node.id)).toBeNull();
  });

  it("keeps the original publisher when the same text is saved again, and re-attributes a change", async () => {
    const layer = freshLayer();
    const node = await seedNode(layer);
    const first = await run(layer, ({ nodes }) => nodes.setBulletin(node.id, "Hackathon", ADA));

    const resaved = await run(layer, ({ nodes }) => nodes.setBulletin(node.id, "Hackathon", GRACE));
    expect(resaved.bulletinPublisherName).toBe("Ada");
    expect(resaved.bulletinPublishedAt).toBe(first.bulletinPublishedAt);
    expect(await storedPublisher(layer, node.id)).toBe("user-ada");

    const changed = await run(layer, ({ nodes }) =>
      nodes.setBulletin(node.id, "Hackathon moved to Friday", GRACE),
    );
    expect(changed.bulletinPublisherName).toBe("Grace");
    expect(Date.parse(changed.bulletinPublishedAt ?? "")).toBeGreaterThanOrEqual(
      Date.parse(first.bulletinPublishedAt ?? ""),
    );
    expect(await storedPublisher(layer, node.id)).toBe("user-grace");
  });

  it("reads a bulletin saved before attribution existed as unattributed, and claims it on the next save", async () => {
    const layer = freshLayer();
    const node = await seedNode(layer);
    await run(layer, ({ db }) =>
      db
        .update(nodesTable)
        .set({ metadata: { kind: "city", bulletin: "Old news" } })
        .where(eq(nodesTable.id, node.id)),
    );

    const legacy = await run(layer, ({ nodes }) => nodes.getById(node.id));
    expect(legacy?.metadata.bulletin).toBe("Old news");
    expect(legacy?.bulletinPublishedAt).toBeNull();
    expect(legacy?.bulletinPublisherName).toBeNull();

    const claimed = await run(layer, ({ nodes }) => nodes.setBulletin(node.id, "Old news", GRACE));
    expect(claimed.bulletinPublisherName).toBe("Grace");
    expect(claimed.bulletinPublishedAt).not.toBeNull();
  });

  it("attributes a bulletin written through a node update and keeps it across unrelated edits", async () => {
    const layer = freshLayer();
    const node = await seedNode(layer);

    const published = await run(layer, ({ nodes }) =>
      nodes.update(node.id, { metadata: { bulletin: "Hackathon" }, publisher: ADA }),
    );
    expect(published.bulletinPublisherName).toBe("Ada");
    expect(await storedPublisher(layer, node.id)).toBe("user-ada");

    const unrelated = await run(layer, ({ nodes }) =>
      nodes.update(node.id, {
        metadata: { bulletin: "Hackathon", poolAccountId: "pool.poolv1.near" },
        publisher: GRACE,
      }),
    );
    expect(unrelated.bulletinPublisherName).toBe("Ada");
    expect(unrelated.bulletinPublishedAt).toBe(published.bulletinPublishedAt);

    const renamed = await run(layer, ({ nodes }) =>
      nodes.update(node.id, { name: "NYC", kind: "region", publisher: GRACE }),
    );
    expect(renamed.bulletinPublisherName).toBe("Ada");

    const removed = await run(layer, ({ nodes }) =>
      nodes.update(node.id, { metadata: { poolAccountId: "pool.poolv1.near" }, publisher: GRACE }),
    );
    expect(removed.metadata.bulletin).toBeUndefined();
    expect(removed.bulletinPublishedAt).toBeNull();
    expect(removed.bulletinPublisherName).toBeNull();
    expect(await storedPublisher(layer, node.id)).toBeNull();
  });

  it("attributes a bulletin a node is created with, and nothing for a blank one", async () => {
    const layer = freshLayer();
    const created = await run(layer, ({ nodes, tenants }) =>
      Effect.gen(function* () {
        const tenant = yield* tenants.createTenant({
          name: "Test Tenant",
          accountId: "test.example.near",
          orgId: "org-1",
        });
        const withBulletin = yield* nodes.spawn({
          kind: "city",
          slug: "nyc",
          name: "New York City",
          parentId: null,
          tenantId: tenant.id,
          metadata: { bulletin: "Welcome" },
          publisher: ADA,
        });
        const blank = yield* nodes.spawn({
          kind: "city",
          slug: "lagos",
          name: "Lagos",
          parentId: null,
          tenantId: tenant.id,
          metadata: { bulletin: "   " },
          publisher: ADA,
        });
        return { withBulletin, blank };
      }),
    );
    expect(created.withBulletin.bulletinPublisherName).toBe("Ada");
    expect(created.withBulletin.bulletinPublishedAt).not.toBeNull();
    expect(await storedPublisher(layer, created.withBulletin.id)).toBe("user-ada");
    expect(created.blank.bulletinPublishedAt).toBeNull();
    expect(created.blank.bulletinPublisherName).toBeNull();
  });
});
