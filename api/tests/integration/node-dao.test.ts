import { rmSync } from "node:fs";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { getMigrationStorage, pluginMigrationSlug } from "everything-dev/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabaseDriver } from "@/db/index";
import { loadMigrations, migrate } from "@/db/migrate";
import { places as placesTable, tenants as tenantsTable } from "@/db/schema";
import pluginDevConfig from "../../plugin.dev";
import { activateTestNode, daoContext, getPluginClient, teardown } from "../setup";

const databaseDir = await vi.hoisted(async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "node-dao-"));
  process.env.API_TEST_DATABASE_URL = `pglite:${dir}`;
  process.env.API_DATABASE_URL = `pglite:${dir}`;
  return dir;
});

vi.mock("@/services/dao", () => ({
  verifyDaoMembership: vi.fn(() =>
    Effect.succeed({ isSputnikContract: true, isMember: true, policy: { roles: [] } }),
  ),
  parsePolicyGroupMembers: vi.fn(() => []),
  isExplicitDaoMember: vi.fn(() => true),
}));

const ids = {
  mainnet: crypto.randomUUID(),
  testnet: crypto.randomUUID(),
  platform: crypto.randomUUID(),
  linked: crypto.randomUUID(),
};

beforeAll(async () => {
  const slug = pluginMigrationSlug(pluginDevConfig.pluginId);
  const schemaName = `plugin_${slug}`;
  const driver = await createDatabaseDriver(`pglite:${databaseDir}`, schemaName);
  try {
    const { migrations } = await Effect.runPromise(loadMigrations);
    const backfill = migrations.findIndex((entry) =>
      entry.sql.some((statement) => statement.includes("'daoAccountId'")),
    );
    expect(backfill).toBeGreaterThan(0);
    const storage = getMigrationStorage(slug);
    await Effect.runPromise(migrate(driver.db, migrations.slice(0, backfill), storage, schemaName));

    const [mainnet, testnet, platform, linked] = await driver.db
      .insert(tenantsTable)
      .values([
        { name: "Mainnet city", accountId: "mainnet-city.sputnik-dao.near", ownerKind: "dao" },
        { name: "Testnet city", accountId: "testnet-city.sputnik-dao.testnet", ownerKind: "dao" },
        { name: "Platform city", accountId: "platform-city.near" },
        { name: "Linked city", accountId: "old-city.sputnik-dao.near", ownerKind: "dao" },
      ])
      .returning({ id: tenantsTable.id });
    const legacy = [
      { id: ids.mainnet, slug: "mainnet-city", name: "Mainnet city", tenantId: mainnet!.id },
      { id: ids.testnet, slug: "testnet-city", name: "Testnet city", tenantId: testnet!.id },
      { id: ids.platform, slug: "platform-city", name: "Platform city", tenantId: platform!.id },
      {
        id: ids.linked,
        slug: "linked-city",
        name: "Linked city",
        tenantId: linked!.id,
        metadata: { daoAccountId: "new-city.sputnik-dao.near", daoNetwork: "mainnet" },
      },
    ];
    for (const node of legacy) {
      const [place] = await driver.db
        .insert(placesTable)
        .values({ slug: node.slug, name: node.name })
        .returning({ id: placesTable.id });
      await driver.db.execute(sql`
        INSERT INTO nodes (id, slug, name, tenant_id, place_id, metadata)
        VALUES (${node.id}, ${node.slug}, ${node.name}, ${node.tenantId}, ${place!.id},
          ${JSON.stringify(node.metadata ?? {})}::jsonb)
      `);
    }

    await Effect.runPromise(migrate(driver.db, migrations, storage, schemaName));
  } finally {
    await driver.close();
  }
}, 30_000);

afterAll(async () => {
  await teardown();
  rmSync(databaseDir, { recursive: true, force: true });
});

describe("public Node DAO", () => {
  it("carries a legacy community's DAO over from its tenant, signed out", async () => {
    const visitor = await getPluginClient();
    expect(await visitor.getNodeDao({ nodeId: ids.mainnet })).toEqual({
      daoAccountId: "mainnet-city.sputnik-dao.near",
      network: "mainnet",
    });
    expect(await visitor.getNodeDao({ nodeId: ids.testnet })).toEqual({
      daoAccountId: "testnet-city.sputnik-dao.testnet",
      network: "testnet",
    });
  });

  it("keeps a DAO link that was already recorded", async () => {
    expect(await (await getPluginClient()).getNodeDao({ nodeId: ids.linked })).toEqual({
      daoAccountId: "new-city.sputnik-dao.near",
      network: "mainnet",
    });
  });

  it("has no DAO for a platform-owned tenant", async () => {
    expect(await (await getPluginClient()).getNodeDao({ nodeId: ids.platform })).toEqual({
      daoAccountId: null,
      network: null,
    });
  });

  it("no longer reads the tenant's account for a new tenant-owned community", async () => {
    const id = crypto.randomUUID().slice(0, 8);
    const dao = `nd-${id}.sputnik-dao.near`;
    const owner = await getPluginClient(daoContext(`dao-owner-${id}`, `dao-org-${id}`, dao));
    const tenant = await owner.createTenant({ name: "DAO city", accountId: dao });
    const { node } = await activateTestNode({
      name: "DAO city",
      slug: `dao-city-${id}`,
      kind: "city",
      tenantId: tenant.id,
      orgId: `dao-org-${id}`,
    });

    expect(await (await getPluginClient()).getNodeDao({ nodeId: node.id })).toEqual({
      daoAccountId: null,
      network: null,
    });
  });

  it("ignores a DAO set through node metadata", async () => {
    const id = crypto.randomUUID().slice(0, 8);
    const dao = `nd-${id}.sputnik-dao.near`;
    const owner = await getPluginClient(daoContext(`dao-owner-${id}`, `dao-org-${id}`, dao));
    const tenant = await owner.createTenant({ name: "DAO city", accountId: dao });
    const { node } = await activateTestNode({
      name: "DAO city",
      slug: `dao-meta-${id}`,
      kind: "city",
      tenantId: tenant.id,
      orgId: `dao-org-${id}`,
    });

    const updated = await owner.updateNode({
      nodeId: node.id,
      metadata: { daoAccountId: "other.sputnik-dao.near", daoNetwork: "mainnet", note: "x" },
    });

    expect(updated.metadata).toMatchObject({ note: "x" });
    expect(updated.metadata.daoAccountId).toBeUndefined();
    expect(await (await getPluginClient()).getNodeDao({ nodeId: node.id })).toEqual({
      daoAccountId: null,
      network: null,
    });
  });

  it("keeps the recorded DAO when node metadata is replaced", async () => {
    const admin = await getPluginClient(daoContext("platform-admin", "platform-org", "admin.near"));
    await admin.updateNode({ nodeId: ids.linked, metadata: { description: "Renamed" } });

    expect(await (await getPluginClient()).getNodeDao({ nodeId: ids.linked })).toEqual({
      daoAccountId: "new-city.sputnik-dao.near",
      network: "mainnet",
    });
  });

  it("has no DAO for an unknown community", async () => {
    expect(await (await getPluginClient()).getNodeDao({ nodeId: crypto.randomUUID() })).toEqual({
      daoAccountId: null,
      network: null,
    });
  });
});
