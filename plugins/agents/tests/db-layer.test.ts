import { sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import { describe, expect, it } from "vitest";
import type { DatabaseDriver } from "../src/db";
import { DatabaseLive, DatabaseTag } from "../src/db/layer";

function withDatabase(url: string, run: (driver: DatabaseDriver) => Promise<void>): Promise<void> {
  const layer = DatabaseLive(url).pipe(Layer.provide(Layer.succeed(PluginIdTag, "agents")));
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const context = yield* Layer.buildWithScope(layer, scope);
        const driver = Context.get(context, DatabaseTag);
        yield* Effect.tryPromise(() => run(driver));
      }),
    ),
  );
}

describe("agents plugin database layer", () => {
  it("applies the vendored migration history on a fresh pglite database", async () => {
    await withDatabase(
      `pglite:.bos/agents/test-${Math.random().toString(36).slice(2)}:memory:`,
      async (driver) => {
        const agentsRows = await driver.db
          .select({ count: sql<number>`count(*)::int` })
          .from((await import("@near-intents-agent-api/database/schema")).agents);
        expect(Number(agentsRows[0]?.count)).toBe(0);

        const ownerNonces = await driver.db.execute(
          sql`select count(*)::int as count from information_schema.tables where table_name = 'owner_nonces'`,
        );
        expect(Number((ownerNonces.rows[0] as { count: number } | undefined)?.count)).toBe(1);
      },
    );
  });

  it("serializes work through the advisory-lock seam", async () => {
    await withDatabase(
      `pglite:.bos/agents/test-${Math.random().toString(36).slice(2)}:memory:`,
      async (driver) => {
        const result = await driver.withAdvisoryLock("test/lock", async () => "held");
        expect(result).toBe("held");
      },
    );
  });
});
