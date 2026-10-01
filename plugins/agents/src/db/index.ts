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

/**
 * Engine selection for the agents plugin's dedicated database:
 * `pglite:` / `:memory:` → in-memory PGlite (dev/test — single connection, so
 * session advisory locks serialize trivially); anything else → the vendored
 * production driver (pg Pool + queued session advisory locks + a dedicated
 * lock pool).
 */
export async function createDatabaseDriver(url: string): Promise<DatabaseDriver> {
  if (url.startsWith("pglite:") || url.includes(":memory:")) {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    return {
      db: db as unknown as DatabaseHandle["db"],
      // PGlite is a single connection: the session lock cannot race another holder.
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

/** The migration journal lives in the `drizzle` schema of the dedicated database. */
export async function ensureJournalSchema(driver: DatabaseDriver): Promise<void> {
  await driver.db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
}
