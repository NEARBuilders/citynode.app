import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type TemplateDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DatabaseDriver {
  readonly db: TemplateDatabase;
  close(): Promise<void>;
}

export async function createDatabaseDriver(
  url: string,
  schemaName?: string,
): Promise<DatabaseDriver> {
  if (url.startsWith("pglite:") || url === ":memory:") {
    const { drizzle } = await import("drizzle-orm/pglite");
    const { PGlite } = await import("@electric-sql/pglite");
    const rawDir = url === ":memory:" ? ":memory:" : url.replace("pglite:", "");
    const dataDir = rawDir.endsWith("/:memory:") || rawDir === ":memory:" ? "memory://" : rawDir;
    if (dataDir !== "memory://") {
      mkdirSync(dirname(dataDir), { recursive: true });
    }
    const pglite = new PGlite(dataDir);
    if (schemaName) {
      await pglite.exec(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      await pglite.exec(`SET search_path TO "${schemaName}", public`);
    }
    const db = drizzle(pglite, { schema });
    return {
      db,
      close: async () => {
        await pglite.close();
      },
    };
  }

  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool({
    connectionString: url,
    ssl:
      url.includes("localhost") || url.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
    idleTimeoutMillis: 30_000,
    ...(schemaName ? { options: `-c search_path="${schemaName}",public` } : {}),
  });
  pool.on("error", (err: Error) => {
    console.error("[Template] Unexpected pool error:", err.message);
  });
  if (schemaName) {
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    } finally {
      client.release();
    }
  }
  let closed = false;
  return {
    db: drizzle(pool, { schema }),
    close: async () => {
      if (closed) return;
      closed = true;
      pool.removeAllListeners("error");
      pool.removeAllListeners("connect");
      await pool.end();
    },
  };
}
