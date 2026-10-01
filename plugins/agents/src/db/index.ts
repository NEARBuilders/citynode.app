import { PGlite } from "@electric-sql/pglite";
import type { DatabaseHandle } from "@near-intents-agent-api/database";
import { createDatabase } from "@near-intents-agent-api/database";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { schema } from "./schema";

export type Database = DatabaseHandle["db"];

export { DatabaseError, unwrapDatabaseError } from "everything-dev/db";

export interface DatabaseDriver {
  readonly db: Database;
  readonly withAdvisoryLock: DatabaseHandle["withAdvisoryLock"];
  readonly tryAdvisoryLock?: DatabaseHandle["tryAdvisoryLock"];
  close(): Promise<void>;
}

export async function createDatabaseDriver(url: string): Promise<DatabaseDriver> {
  if (url.startsWith("pglite:") || url.includes(":memory:")) {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as DatabaseHandle["db"],
      withAdvisoryLock: async (_key, run) => run(),
      close: () => client.close(),
    };
  }

  const handle = createDatabase(url, { max: 10, connectionTimeoutMillis: 10_000 });
  return {
    db: handle.db,
    withAdvisoryLock: handle.withAdvisoryLock,
    tryAdvisoryLock: handle.tryAdvisoryLock,
    close: () => handle.close(),
  };
}

export async function ensureJournalSchema(driver: DatabaseDriver): Promise<void> {
  await driver.db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
}
