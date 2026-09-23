import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { pluginMigrationSlug } from "./core";

export interface DatabaseDriver<TSchema extends Record<string, unknown>> {
  readonly db: PgDatabase<PgQueryResultHKT, TSchema>;
  close(): Promise<void>;
}

/**
 * Resolve a plugin id to its data-schema name on a shared database.
 *
 * Schema names are unconditional `plugin_<slug>` for every workspace on the
 * shared API database. The `pluginId === "api" ? undefined` special case found
 * in older plugin copies is dead code (a plugin is never `api`); api's own
 * tables already live in `plugin_api`.
 */
export function pluginSchemaName(pluginId: string): string {
  return `plugin_${pluginMigrationSlug(pluginId)}`;
}

interface PoolLike {
  on(event: "error", listener: (err: Error) => void): unknown;
  connect(): Promise<{
    query: (sql: string) => Promise<unknown>;
    release: () => void;
  }>;
  removeAllListeners(event?: string | symbol): unknown;
  end(): Promise<void>;
}

/**
 * Connection-level guardrails. `ALTER DATABASE ... SET` only reaches sessions
 * opened after it runs — pooled connections that already exist never inherit
 * it, so any bound must ride on every connection's startup options. Defaults:
 * a lock wait fails after 10s (unbounded waits wedge the whole pool silently),
 * a session idle inside a transaction is reaped after 30s, and statement
 * timeout stays off unless DB_STATEMENT_TIMEOUT_MS is set (long migrations and
 * analytical queries must not break).
 */
function connectionOptions(namespace: string | undefined): string {
  const settings = [
    ...(namespace ? [`-c search_path="${namespace}",public`] : []),
    `-c lock_timeout=${Number(process.env.DB_LOCK_TIMEOUT_MS) || 10_000}`,
    `-c idle_in_transaction_session_timeout=${Number(process.env.DB_IDLE_TX_TIMEOUT_MS) || 30_000}`,
    ...(process.env.DB_STATEMENT_TIMEOUT_MS
      ? [`-c statement_timeout=${Number(process.env.DB_STATEMENT_TIMEOUT_MS)}`]
      : []),
  ];
  return settings.join(" ");
}

function buildPoolConfig(url: string, namespace: string | undefined) {
  // host.docker.internal is docker-local development networking — the test
  // databases a container reaches through the host gateway, which do not
  // terminate TLS.
  const isLocal =
    url.includes("localhost") || url.includes("127.0.0.1") || url.includes("host.docker.internal");
  return {
    connectionString: url,
    ssl: isLocal
      ? false
      : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === "true" },
    max: Number(process.env.DB_POOL_MAX) || 10,
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS) || 30_000,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS) || 30_000,
    options: connectionOptions(namespace),
  };
}

async function ensureNamespaceExists(pool: PoolLike, namespace: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${namespace}"`);
  } finally {
    client.release();
  }
}

function createCloseHandler(pool: PoolLike): () => Promise<void> {
  let closed = false;
  return async () => {
    if (closed) return;
    closed = true;
    pool.removeAllListeners("error");
    pool.removeAllListeners("connect");
    await pool.end();
  };
}

/**
 * Create a drizzle database driver for a plugin, choosing the engine by URL
 * scheme: `pglite:` / `:memory:` → embedded PGlite, anything else → postgres
 * (`pg.Pool`).
 *
 * Drivers stay externalized (never statically imported, never in the Module
 * Federation singleton share set) — they are loaded here via dynamic `import()`
 * only, and `drizzle-orm` appears as a runtime import for the `drizzle` entry
 * points. The `namespace` option expresses every topology the platform needs:
 * `plugin_<slug>` on a shared database, undefined for public-schema (api) or
 * dedicated-database (auth) workloads.
 */
export async function createDatabaseDriver<TSchema extends Record<string, unknown>>(
  url: string,
  schema: TSchema,
  namespace?: string,
): Promise<DatabaseDriver<TSchema>> {
  if (url.startsWith("pglite:") || url === ":memory:") {
    const { drizzle } = await import("drizzle-orm/pglite");
    const { PGlite } = await import("@electric-sql/pglite");
    const rawDir = url === ":memory:" ? ":memory:" : url.replace("pglite:", "");
    const dataDir = rawDir.endsWith("/:memory:") || rawDir === ":memory:" ? "memory://" : rawDir;
    if (dataDir !== "memory://") {
      mkdirSync(dirname(dataDir), { recursive: true });
    }
    const pglite = new PGlite(dataDir);
    if (namespace) {
      await pglite.exec(`CREATE SCHEMA IF NOT EXISTS "${namespace}"`);
      await pglite.exec(`SET search_path TO "${namespace}", public`);
    }
    const db = drizzle(pglite, { schema: schema as never }) as unknown as PgDatabase<
      PgQueryResultHKT,
      TSchema
    >;
    return {
      db,
      close: async () => {
        await pglite.close();
      },
    };
  }

  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const pool = new Pool(buildPoolConfig(url, namespace) as never) as unknown as PoolLike;
  pool.on("error", (err: Error) => {
    console.error("[Database] Unexpected pool error:", err.message);
  });

  if (namespace) {
    await ensureNamespaceExists(pool, namespace);
  }

  const db = drizzle(pool as never, { schema: schema as never }) as unknown as PgDatabase<
    PgQueryResultHKT,
    TSchema
  >;

  return {
    db,
    close: createCloseHandler(pool),
  };
}
