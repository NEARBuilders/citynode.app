import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { migrate as apiMigrate } from "../../../../api/src/db/migrate";
import { migrate as proposalsMigrate } from "../../../../plugins/proposals/api/src/db/migrate";
import { migrate as votesMigrate } from "../../../../plugins/votes/api/src/db/migrate";
import {
  type DatabaseError,
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
