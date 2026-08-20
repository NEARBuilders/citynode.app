import { PluginIdTag } from "every-plugin";
import { Context, Effect, Layer } from "every-plugin/effect";
import type { TemplateDatabase } from "./index";
import { migrate } from "./migrator";

export const DatabaseTag = Context.Tag("template/Database")<TemplateDatabase, TemplateDatabase>();

function normalizeSlug(pluginId: string): string {
  return pluginId
    .replace(/^@[^/]+\//, "")
    .replace(/-plugin$/, "")
    .replace(/[-\s]/g, "_")
    .toLowerCase();
}

export const DatabaseLive = (url: string) =>
  Layer.scoped(
    DatabaseTag,
    Effect.gen(function* () {
      const pluginId = yield* PluginIdTag;
      const schemaName = `plugin_${normalizeSlug(pluginId)}`;

      const driver = yield* Effect.acquireRelease(
        Effect.promise(async () => {
          const { createDatabaseDriver } = await import("./index");
          return createDatabaseDriver(url, schemaName);
        }),
        (driver) => Effect.promise(() => driver.close()),
      );

      const migrations = yield* Effect.promise(async () => {
        const mod = await import("virtual:drizzle-migrations.sql");
        return mod.default;
      });
      yield* Effect.promise(() => migrate(driver.db, migrations, schemaName));
      yield* Effect.logInfo("[Template] Migrations applied");

      return driver.db;
    }),
  );
