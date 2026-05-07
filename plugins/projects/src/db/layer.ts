import { Context, Effect, Layer } from "every-plugin/effect";
import type { ProjectsDatabase } from "./index";

export const DatabaseTag = Context.Tag("projects/Database")<ProjectsDatabase, ProjectsDatabase>();

export const DatabaseLive = (url: string) =>
  Layer.scoped(
    DatabaseTag,
    Effect.acquireRelease(
      Effect.promise(async () => {
        const { createDatabaseDriver } = await import("./index");
        const driver = await createDatabaseDriver(url);
        return driver.db;
      }),
      (_db) =>
        Effect.promise(async () => {
          const { createDatabaseDriver } = await import("./index");
          const driver = await createDatabaseDriver(url);
          await driver.close();
        }).pipe(Effect.catchAll(() => Effect.void)),
    ),
  );
