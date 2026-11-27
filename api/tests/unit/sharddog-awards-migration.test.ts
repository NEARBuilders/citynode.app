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
const AWARDS_TAG = "0023_sharddog-awards";

let activeDir: string | null = null;

afterEach(() => {
  if (activeDir) {
    rmSync(activeDir, { recursive: true, force: true });
    activeDir = null;
  }
});

function countOf(result: unknown): number {
  const rows = (result as { rows?: unknown }).rows ?? result;
  const [row] = Array.isArray(rows) ? (rows as Array<{ count: unknown }>) : [];
  return Number(row?.count ?? 0);
}

describe("adding ShardDog awards", () => {
  it("makes the next sync re-list every event so older check-ins get their NEAR account", async () => {
    activeDir = mkdtempSync(join(tmpdir(), "sharddog-awards-migration-"));
    const driver = await createDatabaseDriver(`pglite:${activeDir}`, SCHEMA);
    try {
      const { migrations } = await Effect.runPromise(loadMigrations);
      const awards = migrations.findIndex((entry) => entry.tag === AWARDS_TAG);
      expect(awards).toBeGreaterThan(0);
      const storage = getMigrationStorage("api");
      await Effect.runPromise(migrate(driver.db, migrations.slice(0, awards), storage, SCHEMA));
      const db = driver.db;

      await db.execute(sql`
        INSERT INTO attendance_code_checkpoints (organization_id, code_id, used_count, reconciled_at)
        VALUES ('org-lagos', 'code-old', 12, now())
      `);
      await db.execute(sql`
        INSERT INTO attendance_event_reconciliations
          (organization_id, event_id, truncated, failed, reconciled_at)
        VALUES ('org-lagos', 'settled-event', false, false, now())
      `);

      await Effect.runPromise(migrate(db, migrations, storage, SCHEMA));

      expect(
        countOf(await db.execute(sql`SELECT count(*) AS count FROM attendance_code_checkpoints`)),
      ).toBe(0);
      expect(
        countOf(
          await db.execute(sql`SELECT count(*) AS count FROM attendance_event_reconciliations`),
        ),
      ).toBe(0);
    } finally {
      await driver.close();
    }
  });
});
