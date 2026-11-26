import type { ORPCError } from "@orpc/server";
import { Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { afterEach, describe, expect, it } from "vitest";
import type { Database, DatabaseError } from "@/db";
import { DatabaseLive, DatabaseTag } from "@/db/layer";
import { attendanceCheckIns } from "@/db/schema";
import { ShardDogLive, type ShardDogService, ShardDogTag } from "@/services/sharddog";
import type { ShardDogClient } from "@/services/sharddog-client";
import { createServiceHarness, createTempDb } from "./test-harness";

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

type Tags = ShardDogTag | DatabaseTag;

function freshLayer(award: ShardDogClient["award"]): Layer.Layer<Tags, DatabaseError, never> {
  const temp = createTempDb("api-sharddog-");
  cleanup = temp.cleanup;
  const database = DatabaseLive(temp.url);
  const client: ShardDogClient = {
    mode: "stub",
    award,
    createClaimLink: async () => ({ claimUrl: "https://shard.dog/claim/x" }),
  };
  return Layer.mergeAll(
    ShardDogLive({ enabled: true, client }).pipe(Layer.provide(database)),
    database,
  ).pipe(Layer.provide(Layer.succeed(PluginIdTag, "api"))) as Layer.Layer<
    Tags,
    DatabaseError,
    never
  >;
}

interface TestServices {
  sharddog: ShardDogService;
  db: Database;
}

const { run } = createServiceHarness<TestServices, Tags, DatabaseError, ORPCError<string, unknown>>(
  Effect.gen(function* () {
    return { sharddog: yield* ShardDogTag, db: yield* DatabaseTag };
  }),
);

const ORG = "org-sharddog";

const checkIns = async (db: Database, count: number) => {
  for (let start = 0; start < count; start += 1_000) {
    await db.insert(attendanceCheckIns).values(
      Array.from({ length: Math.min(1_000, count - start) }, (_, offset) => ({
        organizationId: ORG,
        codeId: "code-1",
        userId: `user-${start + offset}`,
        eventId: "event-1",
        eventName: "Night",
        communityName: "City",
        classified: true,
        accountId: `user-${start + offset}.testnet`,
        checkedInAt: new Date(),
      })),
    );
  }
};

describe("ShardDog award service", () => {
  it("queues awards for a community with more check-ins than one insert can carry", async () => {
    const layer = freshLayer(async () => ({ viewUrl: "https://shard.dog/view/x" }));

    const queued = await run(layer, ({ sharddog, db }) =>
      Effect.gen(function* () {
        yield* Effect.promise(() => checkIns(db, 12_000));
        yield* sharddog.setMembershipDrop({ organizationId: ORG, dropId: "m", updatedBy: "a" });
        yield* sharddog.setEventDrop({
          organizationId: ORG,
          eventId: "event-1",
          dropId: "e",
          updatedBy: "a",
        });
        yield* sharddog.queueAwards(ORG);
        yield* sharddog.queueAwards(ORG);
        return yield* sharddog.awardsFor("user-11999", ORG);
      }),
    );

    expect(queued.map(({ kind }) => kind).sort()).toEqual(["event", "membership"]);
  }, 120_000);

  it("does not send a drop that was replaced after the delivery run picked it up", async () => {
    const sent: string[] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const layer = freshLayer(async ({ dropId }) => {
      sent.push(dropId);
      await gate;
      return { viewUrl: "https://shard.dog/view/x" };
    });

    await run(layer, ({ sharddog, db }) =>
      Effect.gen(function* () {
        const link = (dropId: string) =>
          sharddog.setEventDrop({
            organizationId: ORG,
            eventId: "event-1",
            dropId,
            updatedBy: "a",
          });
        yield* Effect.promise(() => checkIns(db, 5));
        yield* link("old-drop");
        yield* sharddog.queueAwards(ORG);
        yield* Effect.all(
          [
            sharddog.deliverAwards({ organizationId: ORG }),
            Effect.gen(function* () {
              yield* Effect.promise(async () => {
                while (sent.length < 4) await new Promise((done) => setTimeout(done, 10));
              });
              yield* link("new-drop");
              yield* sharddog.queueAwards(ORG);
              release();
            }),
          ],
          { concurrency: "unbounded" },
        );
        yield* sharddog.deliverAwards({ organizationId: ORG });
      }),
    );

    expect(sent.filter((dropId) => dropId === "old-drop")).toHaveLength(4);
    expect(sent.filter((dropId) => dropId === "new-drop")).toHaveLength(1);
  }, 60_000);
});
