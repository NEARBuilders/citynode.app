import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PluginIdTag } from "every-plugin";
import { Cause, Effect, Exit, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { afterEach, describe, expect, it } from "vitest";
import { DatabaseLive } from "@/db/layer";
import { NodesLive, type NodesService, NodesTag } from "@/services/nodes";
import { TenantsLive, type TenantsService, TenantsTag } from "@/services/tenants";

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

function freshLayer(): Layer.Layer<NodesService | TenantsService, unknown, never> {
  const dir = mkdtempSync(join(tmpdir(), "api-nodes-"));
  activeDir = dir;
  const database = DatabaseLive(`pglite:${dir}`);
  return Layer.mergeAll(
    NodesLive.pipe(Layer.provide(database)),
    TenantsLive.pipe(Layer.provide(database)),
  ).pipe(Layer.provide(Layer.succeed(PluginIdTag, "api"))) as Layer.Layer<
    NodesService | TenantsService,
    unknown,
    never
  >;
}

const MISSING_ID = "00000000-0000-0000-0000-000000000000";

interface TestServices {
  nodes: NodesService;
  tenants: TenantsService;
}

async function runService<A>(
  layer: Layer.Layer<NodesService | TenantsService, unknown, never>,
  fn: (svc: TestServices) => Promise<A>,
): Promise<A> {
  const effect = Effect.gen(function* () {
    const nodes = yield* NodesTag;
    const tenants = yield* TenantsTag;
    return yield* Effect.tryPromise({
      try: () => fn({ nodes, tenants }),
      catch: (error) => error,
    });
  });
  return Effect.runPromise(Effect.provide(effect, layer));
}

async function squashServiceError<A>(
  layer: Layer.Layer<NodesService | TenantsService, unknown, never>,
  fn: (svc: TestServices) => Promise<A>,
): Promise<unknown> {
  const effect = Effect.gen(function* () {
    const nodes = yield* NodesTag;
    const tenants = yield* TenantsTag;
    return yield* Effect.tryPromise({
      try: () => fn({ nodes, tenants }),
      catch: (error) => error,
    });
  });
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer));
  if (Exit.isSuccess(exit)) {
    throw new Error("Expected effect to fail");
  }
  return Cause.squash(exit.cause);
}

async function seedTenant(tenants: TenantsService): Promise<string> {
  const tenant = await tenants.createTenant({
    name: "Test Tenant",
    accountId: "test.example.near",
    orgId: "org-1",
  });
  return tenant.id;
}

describe("NodesService", () => {
  it("creates and resolves a node by id", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });

    const node = await runService(layer, ({ nodes }) =>
      nodes.create({
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
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });

    const node = await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "city",
        slug: "chicago",
        name: "Chicago",
        parentId: null,
        tenantId,
        metadata: { population: 2_700_000, region: "midwest" },
      }),
    );
    expect(node.metadata).toEqual({ population: 2_700_000, region: "midwest" });

    const updated = await runService(layer, ({ nodes }) =>
      nodes.update(node.id, { metadata: { population: 2_800_000 } }),
    );
    expect(updated.metadata).toEqual({ population: 2_800_000 });
  });

  it("rejects an invalid slug", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.create({
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
      nodes.create({
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
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });

    const error = await squashServiceError(layer, ({ nodes }) =>
      nodes.create({
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

  it("rejects self-parent on update", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });
    const node = await runService(layer, ({ nodes }) =>
      nodes.create({
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

  it("lists root nodes (parent_id IS NULL)", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });

    const usa = await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "country",
        slug: "usa",
        name: "USA",
        parentId: null,
        tenantId,
      }),
    );
    await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "state",
        slug: "illinois",
        name: "Illinois",
        parentId: usa.id,
        tenantId,
      }),
    );

    const roots = await runService(layer, ({ nodes }) => nodes.listRootNodes());
    expect(roots.map((n) => n.slug)).toEqual(["usa"]);
  });

  it("listChildren returns direct children only", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });

    const usa = await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "country",
        slug: "usa",
        name: "USA",
        parentId: null,
        tenantId,
      }),
    );
    const illinois = await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "state",
        slug: "illinois",
        name: "Illinois",
        parentId: usa.id,
        tenantId,
      }),
    );
    const chicago = await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "city",
        slug: "chicago",
        name: "Chicago",
        parentId: illinois.id,
        tenantId,
      }),
    );

    const usaChildren = await runService(layer, ({ nodes }) => nodes.listChildren(usa.id));
    expect(usaChildren.map((n) => n.slug)).toEqual(["illinois"]);

    const illinoisChildren = await runService(layer, ({ nodes }) =>
      nodes.listChildren(illinois.id),
    );
    expect(illinoisChildren.map((n) => n.slug)).toEqual(["chicago"]);

    expect(chicago).toBeDefined();
  });

  it("resolveBySlug finds root and child nodes", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });

    const usa = await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "country",
        slug: "usa",
        name: "USA",
        parentId: null,
        tenantId,
      }),
    );
    await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "state",
        slug: "illinois",
        name: "Illinois",
        parentId: usa.id,
        tenantId,
      }),
    );

    const root = await runService(layer, ({ nodes }) => nodes.resolveBySlug("usa", null));
    expect(root?.id).toBe(usa.id);

    const child = await runService(layer, ({ nodes }) => nodes.resolveBySlug("illinois", usa.id));
    expect(child?.parentId).toBe(usa.id);

    expect(
      await runService(layer, ({ nodes }) => nodes.resolveBySlug("illinois", null)),
    ).toBeNull();
  });

  it("deletes a node", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });
    const node = await runService(layer, ({ nodes }) =>
      nodes.create({
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

  it("list filters by kind and parentId", async () => {
    const layer = freshLayer();
    const tenantId = await runService(layer, async ({ tenants }) => {
      return await seedTenant(tenants);
    });

    const usa = await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "country",
        slug: "usa",
        name: "USA",
        parentId: null,
        tenantId,
      }),
    );
    await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "state",
        slug: "illinois",
        name: "Illinois",
        parentId: usa.id,
        tenantId,
      }),
    );
    await runService(layer, ({ nodes }) =>
      nodes.create({
        kind: "state",
        slug: "ny",
        name: "New York",
        parentId: usa.id,
        tenantId,
      }),
    );

    const countries = await runService(layer, ({ nodes }) => nodes.list({ kind: "country" }));
    expect(countries.map((n) => n.slug)).toEqual(["usa"]);

    const statesUnderUsa = await runService(layer, ({ nodes }) =>
      nodes.list({ kind: "state", parentId: usa.id }),
    );
    expect(statesUnderUsa.map((n) => n.slug).sort()).toEqual(["illinois", "ny"]);
  });
});
