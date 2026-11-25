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
const BACKFILL_TAG = "0021_backfill-community-tenants";

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

describe("backfilling community tenants", () => {
  it("gives every community without a tenant one, and leaves the rest alone", async () => {
    activeDir = mkdtempSync(join(tmpdir(), "community-tenant-backfill-"));
    const driver = await createDatabaseDriver(`pglite:${activeDir}`, SCHEMA);
    try {
      const { migrations } = await Effect.runPromise(loadMigrations);
      const backfill = migrations.findIndex((entry) => entry.tag === BACKFILL_TAG);
      expect(backfill).toBeGreaterThan(0);
      const storage = getMigrationStorage("api");
      await Effect.runPromise(migrate(driver.db, migrations.slice(0, backfill), storage, SCHEMA));
      const db = driver.db;

      await db.execute(sql`
        INSERT INTO places (slug, name) VALUES
          ('malaysia', 'Malaysia'), ('lagos', 'Lagos'), ('lisbon', 'Lisbon'), ('nowhere', 'Nowhere')
      `);
      await db.execute(sql`
        INSERT INTO tenants (account_id, name, org_id, owner_kind)
        VALUES ('lagos-dao.sputnik-dao.near', 'Lagos', 'org-lagos', 'dao'),
               ('lisbon.near', 'Lisbon', 'org-lisbon', 'dao')
      `);
      await db.execute(sql`
        INSERT INTO nodes (place_id, org_id, tenant_id)
        SELECT p.id, 'org-' || p.slug, CASE WHEN p.slug = 'lisbon' THEN t.id END
        FROM places p LEFT JOIN tenants t ON t.org_id = 'org-' || p.slug
        WHERE p.slug IN ('malaysia', 'lagos', 'lisbon')
      `);
      await db.execute(sql`
        INSERT INTO nodes (place_id, org_id) SELECT id, NULL FROM places WHERE slug = 'nowhere'
      `);

      await Effect.runPromise(migrate(db, migrations, storage, SCHEMA));

      const linked = rowsOf(
        await db.execute(sql`
          SELECT p.slug, t.account_id, t.org_id, t.name, t.owner_kind, t.allow_ui_overrides
          FROM nodes n
          INNER JOIN places p ON p.id = n.place_id
          LEFT JOIN tenants t ON t.id = n.tenant_id
          ORDER BY p.slug
        `),
      );
      expect(linked).toEqual([
        {
          slug: "lagos",
          account_id: "lagos-dao.sputnik-dao.near",
          org_id: "org-lagos",
          name: "Lagos",
          owner_kind: "dao",
          allow_ui_overrides: true,
        },
        {
          slug: "lisbon",
          account_id: "lisbon.near",
          org_id: "org-lisbon",
          name: "Lisbon",
          owner_kind: "dao",
          allow_ui_overrides: true,
        },
        {
          slug: "malaysia",
          account_id: "malaysia.v1.citynode.near",
          org_id: "org-malaysia",
          name: "Malaysia",
          owner_kind: "platform",
          allow_ui_overrides: false,
        },
        {
          slug: "nowhere",
          account_id: null,
          org_id: null,
          name: null,
          owner_kind: null,
          allow_ui_overrides: null,
        },
      ]);
      const tenantCount = rowsOf(
        await db.execute(sql`SELECT count(*)::int AS count FROM tenants`),
      )[0];
      expect(tenantCount).toEqual({ count: 3 });
    } finally {
      await driver.close();
    }
  });
});
