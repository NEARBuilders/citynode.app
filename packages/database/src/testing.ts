import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DatabaseHandle, Db } from "./client.js";
import { advisoryLockKey } from "./lock.js";
import { schema } from "./schema/index.js";

export async function createTestDatabase(): Promise<DatabaseHandle> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  return {
    db: db as unknown as Db,
    close: () => client.close(),
    // PGlite is a single connection, so lock acquisition and release cannot race here; the
    // semantics still match Postgres closely enough for tests that assert serialization.
    withAdvisoryLock: async (key, run) => {
      const lockKey = advisoryLockKey(key);
      await client.query("SELECT pg_advisory_lock($1)", [lockKey]);
      try {
        return await run();
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [lockKey]);
      }
    },
  };
}
