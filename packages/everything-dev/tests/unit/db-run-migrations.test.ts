import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { migrate as apiMigrate } from "../../../../api/src/db/migrate";
import { migrate as proposalsMigrate } from "../../../../plugins/proposals/src/db/migrate";
import { migrate as votesMigrate } from "../../../../plugins/votes/src/db/migrate";
import {
  type DatabaseError,
  isConcurrentDdlUniqueViolation,
  isRetryableMigrationExecutionError,
  type Migration,
  type MigrationDatabase,
  type MigrationStorage,
  runMigrations,
} from "../../src/db";

type Runner = (
  db: MigrationDatabase,
  migrations: Migration[],
  storage?: MigrationStorage,
  schemaName?: string,
) => Effect.Effect<number, DatabaseError>;

function migration(idx: number, tag: string, statements: string[]): Migration {
  return {
    idx,
    when: 1_700_000_000_000 + idx,
    tag,
    hash: `hash-${tag}`,
    sql: statements,
  };
}

function makeDb() {
  const pglite = new PGlite();
  return drizzle(pglite);
}

const JOURNAL = { schema: "drizzle", table: "__drizzle_migrations", slug: "test" } as const;

describe("db migration runners (008 characterization)", () => {
  it("fresh schema: sequential migrations apply, journal tracks hashes, rerun is a no-op", async () => {
    const db = makeDb();
    const migrations = [
      migration(0, "mig_one", ['CREATE TABLE IF NOT EXISTS "t1" (id int)']),
      migration(1, "mig_two", [
        'CREATE TABLE IF NOT EXISTS "t2" (id int)',
        'INSERT INTO "t2" (id) VALUES (1)',
      ]),
    ];

    const applied = await Effect.runPromise(apiMigrate(db as never, migrations, JOURNAL) as never);
    expect(applied).toBe(2);

    const rerun = await Effect.runPromise(apiMigrate(db as never, migrations, JOURNAL) as never);
    expect(rerun).toBe(0);

    const rows = (await db.execute(
      sql`SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY id`,
    )) as { rows: { hash: string }[] };
    expect(rows.rows.map((r) => r.hash)).toEqual(["hash-mig_one", "hash-mig_two"]);
  });

  it("partial overlap (the 25P2 bug): every runner — including votes/proposals via adapters — survives via savepoints", async () => {
    const runners: readonly Runner[] = [apiMigrate, votesMigrate, proposalsMigrate];
    for (const runner of runners) {
      const db = makeDb();
      await db.execute(sql.raw('CREATE TABLE "t_legacy" (id int)'));

      const migrations = [
        migration(0, "overlap", [
          'CREATE TABLE "t_legacy" (id int)',
          'CREATE TABLE "t_new" (id int)',
        ]),
      ];

      const applied = await Effect.runPromise(runner(db, migrations, JOURNAL));
      expect(applied).toBe(1);

      const exists = (await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_name = 't_new'`,
      )) as { rows: unknown[] };
      expect(exists.rows).toHaveLength(1);
    }
  });

  it("preflight: migration whose expected tables all exist is recorded as applied without replaying DDL", async () => {
    const db = makeDb();
    await db.execute(sql.raw('CREATE TABLE "t_pre" (id int)'));

    const migrations = [
      migration(0, "already", ['CREATE TABLE "t_pre" (id int)']),
      migration(1, "fresh", ['CREATE TABLE "t_fresh" (id int)']),
    ];

    const applied = await Effect.runPromise(apiMigrate(db as never, migrations, JOURNAL) as never);
    expect(applied).toBe(2);

    const journal = (await db.execute(
      sql`SELECT hash FROM "drizzle"."__drizzle_migrations" ORDER BY id`,
    )) as { rows: { hash: string }[] };
    expect(journal.rows.map((r) => r.hash)).toContain("hash-already");
  });

  it("retry semantics: a retryable SQLSTATE (23505) on journal init is retried — 3 gen-runs, migration still applies", async () => {
    const db = makeDb() as unknown as {
      execute: (q: unknown) => Promise<unknown>;
      transaction: (fn: (tx: never) => Promise<void>) => Promise<void>;
    };
    let calls = 0;
    let failBudget = 2;
    // Each ensureMigrationTable gen-run issues CREATE SCHEMA then CREATE TABLE.
    // Fail the CREATE TABLE statement (every 2nd call) while budget remains:
    // run 1 fails at call 2, run 2 fails at call 4, run 3 succeeds at call 6.
    // The old `until:` code would stop after run 1 (2 calls) and give up.
    const flaky = {
      execute: async (query: unknown) => {
        calls++;
        if (calls > 6) return db.execute(query);
        if (calls % 2 === 0 && failBudget > 0) {
          failBudget--;
          const err = new Error(
            'duplicate key value violates unique constraint "pg_type_typname_nsp_index"',
          );
          (err as { code?: string }).code = "23505";
          throw err;
        }
        return db.execute(query);
      },
      transaction: (fn: (tx: never) => Promise<void>) => db.transaction(fn),
    };

    const report = await Effect.runPromise(
      runMigrations(
        flaky as never,
        [migration(0, "flaky", ['CREATE TABLE "t_flaky" (id int)'])],
        JOURNAL,
      ),
    );
    expect(report.applied).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(6);
  });
});

function pgUniqueViolation(constraint: string): Error {
  const err = new Error(`duplicate key value violates unique constraint "${constraint}"`);
  (err as { code?: string }).code = "23505";
  (err as { constraint?: string }).constraint = constraint;
  return err;
}

function queryText(query: unknown): string {
  if (typeof query === "string") return query;
  const chunks = (query as { queryChunks?: unknown[] } | undefined)?.queryChunks;
  if (Array.isArray(chunks)) {
    return chunks
      .map((chunk) =>
        typeof chunk === "string" ? chunk : ((chunk as { value?: string[] })?.value ?? []).join(""),
      )
      .join("");
  }
  return "";
}

/**
 * A MigrationDatabase whose transaction hands the runner a tx that throws the
 * given pg error the first time the named table's DDL statement runs — the
 * loser's view of a concurrent `CREATE TABLE` against a fresh database.
 */
function racingLoser(
  db: ReturnType<typeof makeDb>,
  tableName: string,
  throwOnce: () => Error,
): MigrationDatabase {
  let armed = true;
  return {
    execute: (query) => db.execute(query as never),
    transaction: (fn) =>
      db.transaction(
        (tx) =>
          fn({
            execute: async (query: unknown) => {
              const text = queryText(query);
              if (armed && text.includes(`"${tableName}"`)) {
                armed = false;
                throw throwOnce();
              }
              return (tx as { execute: (q: unknown) => Promise<unknown> }).execute(query);
            },
          } as never) as never,
      ),
  } as never;
}

describe("concurrent-DDL race tolerance (23505 on pg_catalog unique indexes)", () => {
  it("loser of a concurrent CREATE TABLE (23505 on pg_type_typname_nsp_index) is tolerated and journaled", async () => {
    const db = makeDb();
    const loser = racingLoser(db, "t_race", () => pgUniqueViolation("pg_type_typname_nsp_index"));

    const report = await Effect.runPromise(
      runMigrations(loser, [migration(0, "race", ['CREATE TABLE "t_race" (id int)'])], {
        journal: JOURNAL,
      }),
    );
    expect(report.applied).toBe(1);

    const journal = (await db.execute(sql`SELECT hash FROM "drizzle"."__drizzle_migrations"`)) as {
      rows: { hash: string }[];
    };
    expect(journal.rows.map((r) => r.hash)).toContain("hash-race");
  });

  it("data-level 23505 on a user-table constraint still fails the migration", async () => {
    const db = makeDb();
    const loser = racingLoser(db, "t_session", () => pgUniqueViolation("t_session_token_key"));

    await expect(
      Effect.runPromise(
        runMigrations(loser, [migration(0, "data", ['CREATE TABLE "t_session" (id int)'])], {
          journal: JOURNAL,
        }),
      ),
    ).rejects.toThrow();
  });

  it("retryable mid-migration SQLSTATE (40P01 deadlock) is retried and then applies", async () => {
    const db = makeDb();
    let deadlocks = 1;
    const loser = racingLoser(db, "t_deadlock", () => {
      deadlocks--;
      const err = new Error("deadlock detected");
      (err as { code?: string }).code = "40P01";
      return err;
    });

    const report = await Effect.runPromise(
      runMigrations(loser, [migration(0, "deadlock", ['CREATE TABLE "t_deadlock" (id int)'])], {
        journal: JOURNAL,
      }),
    );
    expect(report.applied).toBe(1);
    expect(deadlocks).toBe(0);

    const exists = (await db.execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_name = 't_deadlock'`,
    )) as { rows: unknown[] };
    expect(exists.rows).toHaveLength(1);
  });
});

describe("isConcurrentDdlUniqueViolation", () => {
  it("matches pg_catalog unique-index collisions, including through causes", () => {
    expect(isConcurrentDdlUniqueViolation(pgUniqueViolation("pg_type_typname_nsp_index"))).toBe(
      true,
    );
    expect(isConcurrentDdlUniqueViolation(pgUniqueViolation("pg_namespace_nspname_index"))).toBe(
      true,
    );
    expect(isConcurrentDdlUniqueViolation(pgUniqueViolation("pg_class_relname_nsp_index"))).toBe(
      true,
    );
    expect(
      isConcurrentDdlUniqueViolation({ cause: pgUniqueViolation("pg_type_typname_nsp_index") }),
    ).toBe(true);
  });

  it("does not match other states or user-table constraints", () => {
    expect(isConcurrentDdlUniqueViolation(pgUniqueViolation("t_session_token_key"))).toBe(false);
    const duplicate = new Error('relation "t" already exists');
    (duplicate as { code?: string }).code = "42P07";
    expect(isConcurrentDdlUniqueViolation(duplicate)).toBe(false);
    expect(isConcurrentDdlUniqueViolation(new Error("boom"))).toBe(false);
  });
});

describe("isRetryableMigrationExecutionError", () => {
  it("matches deadlock/serialization/lock states and connection failures", () => {
    for (const code of ["40001", "40P01", "55P03", "08001", "ECONNREFUSED"]) {
      const err = new Error("transient");
      (err as { code?: string }).code = code;
      expect(isRetryableMigrationExecutionError(err), code).toBe(true);
    }
  });

  it("does not match duplicate/unique classes — those are tolerance or fatal, not retry", () => {
    expect(isRetryableMigrationExecutionError(pgUniqueViolation("pg_type_typname_nsp_index"))).toBe(
      false,
    );
    const duplicate = new Error('relation "t" already exists');
    (duplicate as { code?: string }).code = "42P07";
    expect(isRetryableMigrationExecutionError(duplicate)).toBe(false);
  });
});
