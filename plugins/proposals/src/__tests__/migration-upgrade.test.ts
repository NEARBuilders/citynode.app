import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { Effect } from "effect";
import { getMigrationStorage } from "everything-dev/db";
import { describe, expect, it } from "vitest";
import { createDatabaseDriver } from "../db/index";
import { loadMigrations, migrate } from "../db/migrate";

describe("proposals migrations", () => {
  it("upgrades legacy proposals and reopens setups that never finished", async () => {
    const driver = await createDatabaseDriver(":memory:", "plugin_proposals");
    try {
      await driver.db.execute(
        sql.raw(`
        CREATE TABLE proposal_audit_log (
          id text PRIMARY KEY, proposal_id text NOT NULL, plugin_id text NOT NULL,
          entity_id text NOT NULL, action text NOT NULL, actor text NOT NULL,
          created_at timestamptz DEFAULT now() NOT NULL
        )
      `),
      );
      await driver.db.execute(
        sql.raw(`
        CREATE TABLE proposal_submissions (
          id text PRIMARY KEY, proposal_id text NOT NULL, plugin_id text NOT NULL,
          entity_id text NOT NULL, submitted_by text NOT NULL,
          created_at timestamptz DEFAULT now() NOT NULL
        )
      `),
      );
      await driver.db.execute(
        sql.raw(`
        CREATE TABLE proposals (
          id text PRIMARY KEY, plugin_id text NOT NULL, entity_id text NOT NULL,
          payload text NOT NULL, schema_version text DEFAULT '1' NOT NULL,
          created_by text NOT NULL, review_status text DEFAULT 'pending' NOT NULL,
          apply_status text DEFAULT 'not_started' NOT NULL, rejection_reason text,
          apply_error text, applied_resource_id text, applied_at timestamptz,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        )
      `),
      );
      await driver.db.execute(
        sql.raw(`
        INSERT INTO proposals (id, plugin_id, entity_id, payload, created_by, review_status, apply_status)
        VALUES ('proposal-pakistan', 'node', 'pakistan', '{}', 'applicant', 'pending', 'not_started'),
          ('proposal-lahore', 'node', 'lahore', '{}', 'applicant', 'approved', 'applying'),
          ('proposal-karachi', 'node', 'karachi', '{}', 'applicant', 'approved', 'applied')
      `),
      );

      const initialMigration = await readFile(
        new URL("../db/migrations/0000_concerned_blade.sql", import.meta.url),
        "utf8",
      );
      const initialHash = createHash("sha256").update(initialMigration).digest("hex");
      const storage = getMigrationStorage("proposals");
      await driver.db.execute(sql.raw(`CREATE SCHEMA IF NOT EXISTS "${storage.schema}"`));
      await driver.db.execute(
        sql.raw(`
          CREATE TABLE "${storage.schema}"."${storage.table}" (
            id serial PRIMARY KEY, hash text NOT NULL, created_at bigint
          )
        `),
      );
      await driver.db.execute(
        sql`INSERT INTO ${sql.raw(`"${storage.schema}"."${storage.table}"`)} (hash, created_at)
            VALUES (${initialHash}, 1780344361156)`,
      );

      const { migrations } = await Effect.runPromise(loadMigrations);
      await Effect.runPromise(migrate(driver.db, migrations, storage, "plugin_proposals"));

      const result = await driver.db.execute(
        sql.raw(`
        SELECT id, operation, review_status FROM proposals WHERE plugin_id = 'node' ORDER BY id
      `),
      );
      const rows = (result as { rows?: unknown[] }).rows ?? (result as unknown[]);
      expect(rows).toEqual([
        expect.objectContaining({ id: "proposal-karachi", review_status: "approved" }),
        expect.objectContaining({ id: "proposal-lahore", review_status: "pending" }),
        expect.objectContaining({
          id: "proposal-pakistan",
          operation: "create",
          review_status: "pending",
        }),
      ]);

      const columns = await driver.db.execute(
        sql.raw(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'proposals' AND (column_name LIKE 'appl%' OR column_name LIKE 'remove%')
      `),
      );
      expect((columns as { rows?: unknown[] }).rows ?? columns).toEqual([]);

      const audit = await driver.db.execute(
        sql.raw(`SELECT proposal_id, action, actor FROM proposal_audit_log`),
      );
      expect((audit as { rows?: unknown[] }).rows ?? audit).toEqual([
        { proposal_id: "proposal-lahore", action: "reopened", actor: "system" },
      ]);

      await driver.db.execute(
        sql.raw(`
        INSERT INTO proposal_submissions (
          id, proposal_id, plugin_id, entity_id, submitted_by,
          source, idempotency_key, payload, metadata
        ) VALUES (
          'submission-pakistan', 'proposal-pakistan', 'node', 'pakistan', 'applicant',
          '/apply', 'pakistan-application', '{}', '{}'
        )
      `),
      );
      await driver.db.execute(
        sql.raw(`
        INSERT INTO proposal_audit_log (
          id, proposal_id, plugin_id, entity_id, action, actor, actor_label, details
        ) VALUES (
          'audit-pakistan', 'proposal-pakistan', 'node', 'pakistan',
          'submitted', 'applicant', 'Applicant', '{}'
        )
      `),
      );
    } finally {
      await driver.close();
    }
  });
});
