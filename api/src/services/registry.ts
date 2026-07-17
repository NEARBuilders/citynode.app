import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "every-plugin/effect";
import { ORPCError } from "every-plugin/orpc";
import { unwrapDatabaseError } from "../db";
import { DatabaseTag } from "../db/layer";
import { things } from "../db/schema";

export interface ThingRecord {
  thingId: string;
  pluginId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegistryService {
  createThing(input: {
    thingId: string;
    pluginId: string;
  }): Effect.Effect<ThingRecord, ORPCError<string, unknown>>;
  getThing(thingId: string): Effect.Effect<ThingRecord | null, ORPCError<string, unknown>>;
  touchThing(thingId: string): Effect.Effect<ThingRecord | null, ORPCError<string, unknown>>;
  deleteThing(thingId: string): Effect.Effect<{ thingId: string }, ORPCError<string, unknown>>;
}

export class RegistryTag extends Context.Tag("api/Registry")<RegistryService, RegistryService>() {}

function toThingRecord(row: {
  thingId: string;
  pluginId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}): ThingRecord {
  return {
    thingId: row.thingId,
    pluginId: row.pluginId,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export const RegistryLive = Layer.effect(
  RegistryTag,
  Effect.gen(function* () {
    const db = yield* DatabaseTag;

    return {
      createThing: (input) =>
        Effect.tryPromise({
          try: async () => {
            const [row] = await db
              .insert(things)
              .values({
                thingId: input.thingId,
                pluginId: input.pluginId,
                updatedAt: new Date(),
              })
              .onConflictDoUpdate({
                target: things.thingId,
                set: {
                  pluginId: input.pluginId,
                  updatedAt: new Date(),
                },
              })
              .returning();

            if (!row) {
              throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Failed to create thing" });
            }

            return toThingRecord(row);
          },
          catch: (error) =>
            error instanceof ORPCError
              ? error
              : new ORPCError("INTERNAL_SERVER_ERROR", {
                  message: unwrapDatabaseError(error),
                }),
        }),

      getThing: (thingId) =>
        Effect.tryPromise({
          try: async () => {
            const [row] = await db.select().from(things).where(eq(things.thingId, thingId));
            return row ? toThingRecord(row) : null;
          },
          catch: (error) =>
            error instanceof ORPCError
              ? error
              : new ORPCError("INTERNAL_SERVER_ERROR", {
                  message: unwrapDatabaseError(error),
                }),
        }),

      touchThing: (thingId) =>
        Effect.tryPromise({
          try: async () => {
            const [row] = await db
              .update(things)
              .set({ updatedAt: new Date() })
              .where(eq(things.thingId, thingId))
              .returning();
            return row ? toThingRecord(row) : null;
          },
          catch: (error) =>
            error instanceof ORPCError
              ? error
              : new ORPCError("INTERNAL_SERVER_ERROR", {
                  message: unwrapDatabaseError(error),
                }),
        }),

      deleteThing: (thingId) =>
        Effect.tryPromise({
          try: async () => {
            const [row] = await db
              .delete(things)
              .where(eq(things.thingId, thingId))
              .returning({ thingId: things.thingId });

            if (!row) {
              throw new ORPCError("NOT_FOUND", { message: "Thing not found" });
            }

            return { thingId: row.thingId };
          },
          catch: (error) =>
            error instanceof ORPCError
              ? error
              : new ORPCError("INTERNAL_SERVER_ERROR", {
                  message: unwrapDatabaseError(error),
                }),
        }),
    };
  }),
);
