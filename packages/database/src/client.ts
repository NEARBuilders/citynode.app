import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { advisoryLockRunner, type DatabaseHandle } from "./lock.js";
import { schema } from "./schema/index.js";
import { tryAdvisoryLockRunner } from "./try-lock.js";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type { DatabaseHandle } from "./lock.js";

export function createDatabase(
  connectionString: string,
  options: { max?: number; connectionTimeoutMillis?: number } = {},
): DatabaseHandle {
  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
  });
  const lockPool = new Pool({
    connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: 1_000,
  });
  return {
    tryAdvisoryLock: tryAdvisoryLockRunner(lockPool),
    db: drizzle(pool, { schema }),
    close: async () => {
      await Promise.all([pool.end(), lockPool.end()]);
    },
    withAdvisoryLock: advisoryLockRunner(pool),
  };
}
