import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { getMigrationStorage } from "everything-dev/db";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseDriver } from "@/db/index";
import { loadMigrations, migrate } from "@/db/migrate";

const SCHEMA = "plugin_api";
const DROP_TAG = "0018_drop-legacy-node-identity";

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  const rows = (result as { rows?: unknown }).rows ?? result;
  return Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
}

async function withLegacyDatabase(
  run: (
    db: Awaited<ReturnType<typeof createDatabaseDriver>>["db"],
    finish: () => Promise<number>,
  ) => Promise<void>,
) {
  activeDir = mkdtempSync(join(tmpdir(), "legacy-node-columns-"));
  const driver = await createDatabaseDriver(`pglite:${activeDir}`, SCHEMA);
  try {
    const { migrations } = await Effect.runPromise(loadMigrations);
    const drop = migrations.findIndex((entry) => entry.tag === DROP_TAG);
    expect(drop).toBeGreaterThan(0);
    const storage = getMigrationStorage("api");
    await Effect.runPromise(migrate(driver.db, migrations.slice(0, drop), storage, SCHEMA));
    await run(driver.db, () => Effect.runPromise(migrate(driver.db, migrations, storage, SCHEMA)));
  } finally {
    await driver.close();
  }
}

describe("dropping the legacy node columns", () => {
  it("refuses while a community node still has no place", async () => {
    await withLegacyDatabase(async (db, finish) => {
      await db.execute(sql`
        INSERT INTO nodes (slug, name, metadata) VALUES ('orphan', 'Orphan', '{"kind":"city"}'::jsonb)
      `);
      await expect(finish()).rejects.toThrow();
      const columns = rowsOf(
        await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${SCHEMA} AND table_name = 'nodes' AND column_name = 'slug'
        `),
      );
      expect(columns).toHaveLength(1);
    });
  });

  it("drops slug, name and parent_id once every community node has a place", async () => {
    await withLegacyDatabase(async (db, finish) => {
      await db.execute(sql`
        INSERT INTO places (slug, name) VALUES ('lagos', 'Lagos')
      `);
      await db.execute(sql`
        INSERT INTO nodes (slug, name, place_id)
        SELECT 'lagos', 'Lagos', id FROM places WHERE slug = 'lagos'
      `);
      await db.execute(sql`
        INSERT INTO nodes (slug, name, metadata) VALUES ('stations', 'Stations', '{"kind":"platform"}'::jsonb)
      `);
      await finish();
      const columns = rowsOf(
        await db.execute(sql`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = ${SCHEMA} AND table_name = 'nodes'
            AND column_name IN ('slug', 'name', 'parent_id')
        `),
      );
      expect(columns).toEqual([]);
      expect(rowsOf(await db.execute(sql`SELECT id FROM nodes`))).toHaveLength(2);
    });
  });

  it("keeps a node's old slug as a legacy alias of its place when they differ", async () => {
    await withLegacyDatabase(async (db, finish) => {
      await db.execute(sql`
        INSERT INTO places (slug, name) VALUES ('nigeria', 'Nigeria'), ('ghana', 'Ghana'), ('accra', 'Accra')
      `);
      await db.execute(sql`
        INSERT INTO nodes (slug, name, place_id)
        SELECT 'lagos-builders', 'Lagos Builders', id FROM places WHERE slug = 'nigeria'
      `);
      await db.execute(sql`
        INSERT INTO nodes (slug, name, place_id)
        SELECT 'accra', 'Accra Builders', id FROM places WHERE slug = 'ghana'
      `);
      await finish();
      const aliases = rowsOf(
        await db.execute(sql`
          SELECT a.value, a.kind, p.slug AS place FROM place_aliases a
          INNER JOIN places p ON p.id = a.place_id ORDER BY a.value
        `),
      );
      expect(aliases).toEqual([{ value: "lagos-builders", kind: "legacy", place: "nigeria" }]);
    });
  });
});
