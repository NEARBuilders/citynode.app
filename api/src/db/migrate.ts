import { Effect } from "effect";
import {
  type DatabaseError,
  detectDrift,
  type LoadedMigrations,
  loadMigrations as loadSharedMigrations,
  type Migration,
  type MigrationStorage,
  runMigrations,
} from "everything-dev/db";

type MigrationDatabase = Parameters<typeof runMigrations>[0];
type MigrationReport = Effect.Success<ReturnType<typeof runMigrations>>;
export type DriftReport = Effect.Success<ReturnType<typeof detectDrift>>;

export type { LoadedMigrations };
export { detectDrift };

export const loadMigrations: Effect.Effect<LoadedMigrations, DatabaseError> = loadSharedMigrations({
  fromDir: import.meta.dirname,
  virtual: () => import("virtual:drizzle-migrations.sql"),
});

/**
 * Thin adapter over the shared `runMigrations` runner (`everything-dev/db`).
 *
 * This file is sync-owned: `bos sync` copies it verbatim into every plugin's
 * `src/db/migrate.ts`, so it must stay workspace-agnostic — the drizzle
 * migrations arrive via the bundler's `virtual:drizzle-migrations.sql` module
 * (declared in each workspace's `src/global.d.ts`) with a disk fallback.
 * Duplicate-DDL tolerance, savepoint handling, and the retryable-SQLSTATE
 * journal-init backoff all live in the shared runner now.
 */
export function migrate(
  db: MigrationDatabase,
  migrations: Migration[],
  storage?: MigrationStorage,
  schemaName?: string,
): Effect.Effect<number, DatabaseError> {
  return Effect.map(
    runMigrations(db, migrations, { journal: storage, schemaName }),
    (report) => report.applied,
  );
}

export type { Migration, MigrationReport };
