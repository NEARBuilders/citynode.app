import { Context, Effect, Layer } from "every-plugin/effect";
import { createDatabase, type Database } from "./index";

export const DatabaseTag = Context.Tag("projects/Database")<Database, Database>();
export type DatabaseTag = typeof DatabaseTag;

export const DatabaseLive = (url: string, authToken?: string) =>
  Layer.scoped(
    DatabaseTag,
    Effect.acquireRelease(
      Effect.sync(() => createDatabase(url, authToken)),
      (acquired) => Effect.sync(() => acquired.client.close()),
    ).pipe(Effect.map((acquired) => acquired.db)),
  );
