import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface MigrationStorage {
  schema: string;
  table: string;
  slug: string;
}

const DEFAULT_MIGRATION_JOURNAL = {
  schema: "drizzle",
  table: "__drizzle_migrations",
} as const;

const PER_PLUGIN_ISOLATION = false;

export function normalizeSlug(name: string): string {
  const basename = name.split("/").pop() ?? name;
  return basename
    .replace(/^@/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/-plugin$/i, "")
    .replace(/-/g, "_")
    .toLowerCase();
}

export function getMigrationSlug(dir?: string): string {
  if (!dir) return normalizeSlug(process.env.npm_package_name ?? "unknown");
  let current = dir;
  for (let i = 0; i < 10; i++) {
    const pkgPath = join(current, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as { name?: string };
        return normalizeSlug(pkg.name ?? current);
      } catch {
        return normalizeSlug(current);
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return normalizeSlug(dir);
}

export function getMigrationStorage(
  slug?: string,
  options?: { isolated?: boolean },
): MigrationStorage {
  const s = normalizeSlug(slug ?? getMigrationSlug());
  const isolated = options?.isolated ?? PER_PLUGIN_ISOLATION;
  if (isolated) {
    return {
      schema: DEFAULT_MIGRATION_JOURNAL.schema,
      table: `__drizzle_migrations_${s}`,
      slug: s,
    };
  }
  return {
    schema: DEFAULT_MIGRATION_JOURNAL.schema,
    table: DEFAULT_MIGRATION_JOURNAL.table,
    slug: s,
  };
}

/**
 * Format a JavaScript string array as a PostgreSQL text array literal for use
 * with Drizzle's `sql` tag. Example return:
 *   `'{"h1","h2"}'::text[]`
 *
 * Usage: sql`WHERE col = ANY(${toSqlArray(values)})`
 *
 * Drizzle's default parameter binding does not handle array types correctly
 * with the pg driver (it emits `ANY(($1))` with a single string, which
 * Postgres rejects as a malformed array literal).
 */
export function toSqlArray(arr: string[]): string {
  if (arr.length === 0) return `'{}'::text[]`;
  const escaped = arr.map((v) => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"'));
  return `'{${escaped.map((v) => `"${v}"`).join(",")}}'::text[]`;
}

export function pluginMigrationSlug(key: string): string {
  return normalizeSlug(key);
}

export function getDatabaseUrlSecretName(slug: string): string {
  return `${slug.toUpperCase().replace(/-/g, "_")}_DATABASE_URL`;
}

const RETRYABLE_SQLSTATES: ReadonlySet<string> = new Set([
  "42P06",
  "42710",
  "42701",
  "42P07",
  "23505",
  "40001",
  "40P01",
]);

const RETRYABLE_DRIVER_CODES: ReadonlySet<string> = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
]);

/**
 * Decide whether a failed migration-init statement (schema/journal creation)
 * is worth retrying. Covers the concurrent `CREATE SCHEMA IF NOT EXISTS`
 * race (unique violation on `pg_namespace`, duplicate-object errors),
 * serialization/deadlock errors, and transient connection failures.
 */
export function isRetryableMigrationError(error: unknown): boolean {
  let current: unknown = error;
  for (let i = 0; i < 6 && current; i++) {
    if (typeof current === "object" && current !== null) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string") {
        if (RETRYABLE_SQLSTATES.has(code)) return true;
        if (code.startsWith("08")) return true;
        if (RETRYABLE_DRIVER_CODES.has(code)) return true;
      }
    }
    current = (current as { cause?: unknown })?.cause;
  }
  return false;
}

const PG_QUERY_QUEUE_DEPRECATION = "client.query() when the client is already executing a query";

let pgWarningFilterInstalled = false;

/**
 * Silence pg's query-queue deprecation warning (fires once per process from
 * pg-pool's internal dispatch under concurrent boot load — node-postgres#3612,
 * #3617). Node's default warning handler prints even when user listeners are
 * attached, so it is removed first; every other warning is re-printed here.
 */
export function suppressPgQueryQueueDeprecation(): void {
  if (pgWarningFilterInstalled) return;
  if (typeof process === "undefined" || typeof process.on !== "function") return;
  pgWarningFilterInstalled = true;
  process.removeAllListeners("warning");
  process.on("warning", (warning) => {
    if (
      warning.name === "DeprecationWarning" &&
      warning.message.includes(PG_QUERY_QUEUE_DEPRECATION)
    ) {
      return;
    }
    console.error(warning.stack || `${warning.name}: ${warning.message}`);
  });
}

export function extractExpectedTables(migrations: { sql: string[] }[]): string[] {
  const tables = new Set<string>();
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"\.)?"([^"]+)"/gi;
  for (const migration of migrations) {
    for (const stmt of migration.sql) {
      for (const match of stmt.matchAll(re)) {
        const tableName = match[2];
        if (tableName) {
          tables.add(tableName);
        }
      }
    }
  }
  return [...tables];
}
