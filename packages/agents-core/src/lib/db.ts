import type { DatabaseHandle, Db, Tx } from "@near-intents-agent-api/database";
import { sql } from "drizzle-orm";
import { requiredSlot } from "./slot.js";

type DatabaseAccess = Pick<DatabaseHandle, "db" | "withAdvisoryLock">;

const slot = requiredSlot<DatabaseAccess>("Database");

export function configureDatabase(database: DatabaseAccess) {
  slot.set(database);
}

export function getDatabase(): Db {
  return slot.get().db;
}

/** Serializes work across replicas under a Postgres advisory lock. See `DatabaseHandle`. */
export function withAdvisoryLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  return slot.get().withAdvisoryLock(key, run);
}

/**
 * Wall-clock database time for an authorization decision. PostgreSQL `now()` is fixed at
 * transaction start, so it predates any row-lock wait; read this after the locks are held.
 */
export async function databaseClock(tx: Tx): Promise<Date> {
  const [row] = (await tx.execute<{ now: Date }>(sql`select clock_timestamp() as now`)).rows;
  if (!row) throw new Error("database_clock_unavailable");
  return new Date(row.now);
}
