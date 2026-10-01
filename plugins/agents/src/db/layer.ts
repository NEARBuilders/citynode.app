import { Context, Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { getMigrationStorage, pluginMigrationSlug } from "everything-dev/db";
import {
  createDatabaseDriver,
  type DatabaseDriver,
  DatabaseError,
  ensureJournalSchema,
} from "./index";
import { detectDrift, loadMigrations, migrate } from "./migrate";

export class DatabaseTag extends Context.Service<DatabaseTag, DatabaseDriver>()("Database") {}

export const DatabaseLive = (url: string) =>
  Layer.effect(
    DatabaseTag,
    Effect.gen(function* () {
      const pluginId = yield* PluginIdTag;
      const slug = pluginMigrationSlug(pluginId);
      const storage = getMigrationStorage(slug);

      const driver = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: () => createDatabaseDriver(url),
          catch: (cause) => new DatabaseError({ stage: "driver", cause }),
        }),
        (driver) =>
          Effect.tryPromise({
            try: () => driver.close(),
            catch: (cause) => new DatabaseError({ stage: "close", cause }),
          }).pipe(Effect.ignore),
      );

      yield* Effect.tryPromise({
        try: () => ensureJournalSchema(driver),
        catch: (cause) => new DatabaseError({ stage: "migration", cause }),
      });

      const { migrations, source } = yield* loadMigrations();

      if (migrations.length === 0) {
        yield* Effect.logWarning(
          `[Database] No migrations found (source: ${source}) — schema may be missing`,
        );
      } else {
        const applied = yield* migrate(driver.db, migrations, storage);

        if (applied === 0) {
          yield* Effect.logInfo(
            `[Database] Schema up to date (0 migrations needed, source: ${source})`,
          );
        } else {
          yield* Effect.logInfo(
            `[Database] Applied ${applied}/${migrations.length} migration(s) (source: ${source}, journal: ${storage.schema}.${storage.table})`,
          );
        }

        const drift = yield* detectDrift(driver.db, migrations, storage);
        if (drift.status === "healthy" || drift.status === "untracked-existing-schema") {
          yield* Effect.logInfo(`[Database] Ready`);
        } else {
          yield* Effect.logWarning(
            `[Database] ⚠️ Migration drift detected (${drift.status}) — run \`bos db doctor ${storage.slug}\`.`,
          );
        }
      }

      return driver;
    }),
  );
