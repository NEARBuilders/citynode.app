import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { sql } from "drizzle-orm";
import { Effect, Option, Schedule } from "effect";
import {
  DUPLICATE_OBJECT_SQLSTATES,
  extractExpectedTables,
  getMigrationStorage,
  isRetryableMigrationError,
  type MigrationStorage,
  toSqlArray,
} from "./core";
import { DatabaseError } from "./errors";

export interface Migration {
  idx: number;
  when: number;
  tag: string;
  hash: string;
  sql: string[];
}

/**
 * Minimal structural view of a drizzle PgDatabase — the concrete per-workspace
 * `PgDatabase<PgQueryResultHKT, TSchema>` values satisfy this.
 */
export interface MigrationDatabase {
  execute(query: unknown): Promise<unknown>;
  transaction<T>(fn: (tx: { execute(query: unknown): Promise<unknown> }) => Promise<T>): Promise<T>;
}

export interface LoadedMigrations {
  migrations: Migration[];
  source: "virtual" | "disk";
}

export interface DriftReport {
  status: "healthy" | "empty" | "untracked-existing-schema" | "drift-safe-repair" | "drift-manual";
  expectedTables: string[];
  missingTables: string[];
  appliedHashes: number;
  localHashes: number;
  storage: MigrationStorage;
}

export interface MigrationReport {
  applied: number;
  total: number;
  storage: MigrationStorage;
  schema: string | undefined;
}

export interface RunMigrationsOptions {
  schemaName?: string;
  journal?: MigrationStorage;
  duplicateSqlStates?: readonly string[];
}

const DEFAULT_DUPLICATE_SQLSTATES: readonly string[] = DUPLICATE_OBJECT_SQLSTATES;

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function isDuplicateObjectError(
  error: unknown,
  codes: readonly string[] = DEFAULT_DUPLICATE_SQLSTATES,
): boolean {
  let current: unknown = error;
  for (let i = 0; i < 5 && current; i++) {
    if (typeof current === "object" && current !== null && "code" in current) {
      const code = (current as { code: unknown }).code;
      if (typeof code === "string" && codes.includes(code)) return true;
    }
    current = (current as { cause?: unknown })?.cause;
  }
  return false;
}

/**
 * Check which of the given expected tables already exist in the target schema.
 * The schema name is bound as a query parameter.
 */
function getExistingTables(
  db: MigrationDatabase,
  tables: string[],
  schemaName?: string,
): Effect.Effect<Set<string>, DatabaseError> {
  if (tables.length === 0) return Effect.succeed(new Set<string>());
  const schema = schemaName ?? "public";
  return Effect.tryPromise({
    try: () =>
      db.execute(sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = ${schema}
          AND table_name = ANY(${sql.raw(toSqlArray(tables))})
      `),
    catch: (cause) =>
      new DatabaseError({ stage: "migration", migrationTag: "preflight-table-check", cause }),
  }).pipe(
    Effect.map((result: unknown) => {
      const existing = new Set(
        normalizeRows<{ table_name: string }>(result).map((r) => r.table_name),
      );
      return existing;
    }),
    Effect.catch(() => Effect.succeed(new Set<string>())),
  );
}

/** Read applied hashes from the migration journal, returning an empty set on failure. */
function readAppliedHashes(
  db: MigrationDatabase,
  ref: ReturnType<typeof sql.raw>,
): Effect.Effect<Set<string>, DatabaseError> {
  return Effect.tryPromise({
    try: () => db.execute(sql`SELECT hash FROM ${ref}`),
    catch: (cause) =>
      new DatabaseError({ stage: "migration", migrationTag: "read-applied", cause }),
  }).pipe(
    Effect.map((result: unknown) => {
      const hashes = normalizeRows<{ hash: string }>(result).map((r) => r.hash);
      return new Set(hashes);
    }),
    Effect.catch(() => Effect.succeed(new Set<string>())),
  );
}

export interface LoadMigrationsOptions {
  /** Directory containing the workspace's drizzle `migrations/` folder for the disk fallback. */
  fromDir?: string;
  /**
   * Bundler-provided virtual-module loader (e.g. `virtual:drizzle-migrations.sql`
   * registered by rspack). Lives at the call site — the shared package must not
   * name the virtual module, which only exists inside plugin bundles.
   */
  virtual?: () => Promise<{ default?: Migration[] }>;
}

export function loadMigrations(
  opts: LoadMigrationsOptions = {},
): Effect.Effect<LoadedMigrations, DatabaseError> {
  return Effect.gen(function* () {
    if (opts.virtual) {
      const mod = yield* Effect.tryPromise({
        try: () => opts.virtual!(),
        catch: (cause) => new DatabaseError({ stage: "load", cause }),
      }).pipe(Effect.option);
      const migrations = Option.getOrUndefined(mod)?.default;
      if (migrations?.length) {
        yield* Effect.logInfo(
          `[Database] Loaded ${migrations.length} migration(s) from virtual module`,
        );
        return { migrations, source: "virtual" as const };
      }
      yield* Effect.logDebug("[Database] Virtual migrations unavailable, loading from disk");
    }

    const diskMigrations = Option.getOrUndefined(
      yield* loadMigrationsFromDisk(opts.fromDir).pipe(Effect.option),
    );
    if (diskMigrations) {
      yield* Effect.logInfo(`[Database] Loaded ${diskMigrations.length} migration(s) from disk`);
      return { migrations: diskMigrations, source: "disk" as const };
    }

    yield* Effect.logWarning("[Database] No migrations found from virtual or disk");
    return { migrations: [], source: "disk" as const };
  });
}

function loadMigrationsFromDisk(fromDir?: string): Effect.Effect<Migration[], DatabaseError> {
  return Effect.try({
    try: () => {
      const migrationsDir = resolve(fromDir ?? import.meta.dirname, "migrations");
      const metaDir = join(migrationsDir, "meta");
      const journalPath = join(metaDir, "_journal.json");

      if (!existsSync(journalPath)) {
        throw new Error(
          `Migrations journal not found at ${journalPath}. Run \`db:generate\` first.`,
        );
      }

      const journal = JSON.parse(readFileSync(journalPath, "utf8"));

      return journal.entries.map((entry: { idx: number; when: number; tag: string }) => {
        const sqlPath = join(migrationsDir, `${entry.tag}.sql`);
        if (!existsSync(sqlPath)) {
          throw new Error(`Migration SQL file not found: ${sqlPath}`);
        }
        const raw = readFileSync(sqlPath, "utf8");
        const sqlStatements = raw.split("--> statement-breakpoint").map((s: string) => s.trim());
        const hash = createHash("sha256").update(raw).digest("hex");

        return {
          idx: entry.idx,
          when: entry.when,
          tag: entry.tag,
          hash,
          sql: sqlStatements,
        };
      });
    },
    catch: (cause) => new DatabaseError({ stage: "load", cause }),
  });
}

function journalRef(s: MigrationStorage): ReturnType<typeof sql> {
  return sql.raw(`"${s.schema}"."${s.table}"`);
}

/**
 * Apply pending migrations to the target database.
 *
 * Namespace model: `opts.schemaName` (`plugin_<slug>`) scopes data tables; the
 * journal lives in `opts.journal` (default the shared `drizzle.__drizzle_migrations`).
 * Undefined `schemaName` means public-schema (api) or dedicated-DB (auth) topology.
 *
 * Reliability floor: per-migration transaction with the journal insert,
 * SAVEPOINT-based duplicate-DDL tolerance, retryable-SQLSTATE backoff on journal
 * init, hash-tracked idempotence with a preflight that records fully-overlapped
 * migrations as applied.
 */
export function runMigrations(
  db: MigrationDatabase,
  migrations: Migration[],
  opts: RunMigrationsOptions = {},
): Effect.Effect<MigrationReport, DatabaseError> {
  return Effect.gen(function* () {
    const sorted = [...migrations].sort((a, b) => a.idx - b.idx);
    const journal = opts.journal ?? getMigrationStorage();
    const schemaName = opts.schemaName;
    const duplicateSqlStates = opts.duplicateSqlStates ?? DEFAULT_DUPLICATE_SQLSTATES;

    yield* ensureMigrationTable(db, journal);

    if (schemaName) {
      yield* Effect.tryPromise({
        try: () => db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.raw(`"${schemaName}"`)}`),
        catch: (cause) =>
          new DatabaseError({ stage: "migration", migrationTag: "init-data-schema", cause }),
      });
    }

    const ref = journalRef(journal);
    const appliedHashes = yield* readAppliedHashes(db, ref);

    let applied = 0;
    for (const migration of sorted) {
      const isApplied =
        appliedHashes.has(migration.hash) || appliedHashes.has(migration.hash.slice(0, 12));
      if (isApplied) continue;

      // Preflight: if this migration's expected tables already exist, record it
      // as applied rather than crashing on a duplicate DDL error.
      const expectedTables = extractExpectedTables([migration]);
      if (expectedTables.length > 0) {
        const existing = yield* getExistingTables(db, expectedTables, schemaName);
        const missingTables = expectedTables.filter((t) => !existing.has(t));
        if (missingTables.length === 0) {
          yield* Effect.logWarning(
            `[Database] All tables for migration ${migration.tag} already exist — ` +
              `recording as applied without replaying DDL`,
          );
          yield* Effect.tryPromise({
            try: () =>
              db.execute(
                sql`INSERT INTO ${ref} (hash, created_at) VALUES (${migration.hash}, ${migration.when})`,
              ),
            catch: (cause) =>
              new DatabaseError({
                stage: "migration",
                migrationTag: migration.tag,
                cause,
              }),
          });
          appliedHashes.add(migration.hash);
          applied++;
          continue;
        }
        if (missingTables.length < expectedTables.length) {
          yield* Effect.logWarning(
            `[Database] Partial table overlap for migration ${migration.tag}: ` +
              `${expectedTables.length - missingTables.length} table(s) exist but not all. ` +
              `Applying migration — existing tables: ${expectedTables.filter((t) => existing.has(t)).join(", ")}`,
          );
        }
      }

      yield* Effect.logInfo(`[Database] Applying migration: ${migration.tag}`);

      yield* Effect.tryPromise({
        try: () =>
          db.transaction(async (tx) => {
            for (const [i, statement] of migration.sql.entries()) {
              const stmt = schemaName ? statement.replace(/"public"\./g, "") : statement;
              const sp = `stmt_${i}`;
              await tx.execute(sql.raw(`SAVEPOINT ${sp}`));
              try {
                await tx.execute(sql.raw(stmt));
              } catch (cause) {
                if (isDuplicateObjectError(cause, duplicateSqlStates)) {
                  await tx.execute(sql.raw(`ROLLBACK TO SAVEPOINT ${sp}`));
                  continue;
                }
                throw new DatabaseError({
                  stage: "migration",
                  migrationTag: migration.tag,
                  statementIndex: i,
                  cause,
                });
              }
              await tx.execute(sql.raw(`RELEASE SAVEPOINT ${sp}`));
            }
            await tx.execute(
              sql`INSERT INTO ${ref} (hash, created_at) VALUES (${migration.hash}, ${migration.when})`,
            );
          }),
        catch: (cause) =>
          cause instanceof DatabaseError
            ? cause
            : new DatabaseError({ stage: "migration", migrationTag: migration.tag, cause }),
      });
      applied++;
    }

    return {
      applied,
      total: sorted.length,
      storage: journal,
      schema: schemaName,
    };
  });
}

function ensureMigrationTable(
  db: MigrationDatabase,
  storage: MigrationStorage,
): Effect.Effect<void, DatabaseError> {
  const ref = journalRef(storage);
  return Effect.retry(
    Effect.gen(function* () {
      yield* Effect.tryPromise({
        try: () => db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.raw(`"${storage.schema}"`)}`),
        catch: (cause) =>
          new DatabaseError({ stage: "migration", migrationTag: "init-schema", cause }),
      });

      yield* Effect.tryPromise({
        try: () =>
          db.execute(sql`
            CREATE TABLE IF NOT EXISTS ${ref} (
              id SERIAL PRIMARY KEY,
              hash text NOT NULL,
              created_at bigint
            )
          `),
        catch: (cause) =>
          new DatabaseError({ stage: "migration", migrationTag: "init-table", cause }),
      });
    }),
    {
      schedule: Schedule.spaced("500 millis"),
      times: 3,
      while: isRetryableMigrationError,
    },
  );
}

/**
 * Detect drift between the local migration set and the database journal.
 *
 * Pass an explicit `journal` resolved from the caller's workspace for reliable
 * slug derivation; the default relies on `process.env.npm_package_name`, which is
 * unreliable under bundlers and Module Federation remotes.
 */
export function detectDrift(
  db: MigrationDatabase,
  migrations: Migration[],
  journal?: MigrationStorage,
  schemaName?: string,
): Effect.Effect<DriftReport, DatabaseError> {
  return Effect.gen(function* () {
    const storage = journal ?? getMigrationStorage();
    const expectedTables = extractExpectedTables(migrations);
    const ref = journalRef(storage);

    const appliedHashes = yield* readAppliedHashes(db, ref);
    const appliedCount = appliedHashes.size;

    if (expectedTables.length === 0) {
      return {
        status: "empty",
        expectedTables: [],
        missingTables: [],
        appliedHashes: appliedCount,
        localHashes: migrations.length,
        storage,
      };
    }

    const existing = yield* getExistingTables(db, expectedTables, schemaName);
    const missingTables = expectedTables.filter((t) => !existing.has(t));

    if (appliedCount === 0 && missingTables.length === 0) {
      // Journal is empty but all expected tables already exist.
      return {
        status: "untracked-existing-schema",
        expectedTables,
        missingTables: [],
        appliedHashes: 0,
        localHashes: migrations.length,
        storage,
      };
    }

    if (missingTables.length === 0) {
      return {
        status: "healthy",
        expectedTables,
        missingTables: [],
        appliedHashes: appliedCount,
        localHashes: migrations.length,
        storage,
      };
    }

    if (missingTables.length === expectedTables.length) {
      return {
        status: "drift-safe-repair",
        expectedTables,
        missingTables,
        appliedHashes: appliedCount,
        localHashes: migrations.length,
        storage,
      };
    }

    return {
      status: "drift-manual",
      expectedTables,
      missingTables,
      appliedHashes: appliedCount,
      localHashes: migrations.length,
      storage,
    };
  });
}
