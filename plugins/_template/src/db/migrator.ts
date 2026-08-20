import type { Migration } from "virtual:drizzle-migrations.sql";
import { sql } from "drizzle-orm";
import type { TemplateDatabase } from "./index";

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function isDuplicateObjectError(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === "object" && current !== null && "code" in current) {
      if ((current as { code: unknown }).code === "42710") return true;
    }
    current = (current as { cause?: unknown })?.cause;
  }
  return false;
}

export async function migrate(
  db: TemplateDatabase,
  migrations: Migration[],
  schemaName?: string,
): Promise<void> {
  if (schemaName) {
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.raw(`"${schemaName}"`)}`);
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);

  interface MigrationRow {
    hash: string;
  }

  const rawResult = await db.execute(sql`SELECT hash FROM "drizzle_migrations"`);
  const appliedRows = normalizeRows<MigrationRow>(rawResult);
  const appliedHashes = new Set(appliedRows.map((r) => r.hash));

  for (const migration of migrations) {
    if (appliedHashes.has(migration.hash)) continue;
    console.log(`[Template] Applying migration: ${migration.tag}`);

    await db.transaction(async (tx) => {
      for (const statement of migration.sql) {
        try {
          const stmt = schemaName ? statement.replace(/"public"\./g, "") : statement;
          await tx.execute(sql.raw(stmt));
        } catch (cause) {
          if (isDuplicateObjectError(cause)) continue;
          throw cause;
        }
      }
      await tx.execute(
        sql`INSERT INTO "drizzle_migrations" (hash, created_at) VALUES (${migration.hash}, ${Date.now()})`,
      );
    });
  }
}
