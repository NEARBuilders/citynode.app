import {
  claimOperationDispatch,
  commitExecutionDispatch,
  configureDatabase,
  configurePrices,
  createPendingOperation,
  readBudgetFor,
} from "@near-intents-agent-api/agents-core";
import {
  agents,
  auditEvents,
  operations,
  operationTombstones,
  spendCharges,
  tenants,
  user,
} from "@near-intents-agent-api/database";
import { eq, sql } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { DatabaseDriver } from "../src/db";
import { DatabaseLive, DatabaseTag } from "../src/db/layer";

const adminUrl = process.env.AGENTS_RACE_DATABASE_URL;
const raceDb = "agents_budget_race_test";
const raceUrl = adminUrl?.replace(/\/[^/]+$/, `/${raceDb}`) ?? "";

async function resetRaceDatabase() {
  const admin = new pg.Pool({ connectionString: adminUrl });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${raceDb} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${raceDb}`);
  } finally {
    await admin.end();
  }
}

const token = "nep141:wrap.near";
const transfer = (idempotencyKey: string) => ({
  action: "intents_transfer" as const,
  request: { token, amount: "1000000", to: "r.near", idempotencyKey },
});
const oneDollar = () => ({ decimals: 6, coefficient: 1n, scale: 0, updatedAtMs: Date.now() });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const codeOf = (error: unknown) => (error as { code?: string }).code;
const settle = (attempt: Promise<unknown>) =>
  attempt.then(
    () => "committed",
    (error) => codeOf(error) ?? "error",
  );

type Caps = { daily?: number; weekly?: number; monthly?: number };

function withDatabase(url: string, run: (driver: DatabaseDriver) => Promise<void>): Promise<void> {
  const layer = DatabaseLive(url).pipe(Layer.provide(Layer.succeed(PluginIdTag, "agents")));
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const scope = yield* Effect.scope;
        const context = yield* Layer.buildWithScope(layer, scope);
        const driver = Context.get(context, DatabaseTag);
        configureDatabase(driver);
        yield* Effect.tryPromise(() => run(driver));
      }),
    ),
  );
}

/** A tenant and agent under `caps` (cents), and helpers to admit and commit operations for it. */
async function fixture(database: DatabaseDriver, caps: Caps) {
  const id = crypto.randomUUID();
  await database.db.insert(user).values({ id, name: "spend", email: `${id}@test.invalid` });
  await database.db.insert(tenants).values({ id, ownerUserId: id });
  await database.db.insert(agents).values({
    id,
    tenantId: id,
    name: "spend",
    budgetDailyCents: caps.daily ?? null,
    budgetWeeklyCents: caps.weekly ?? null,
    budgetMonthlyCents: caps.monthly ?? null,
    budgetRevision: 1,
  });
  const actor = { tenantId: id, keyId: "key" };
  return {
    id,
    /** An admitted, claimed execution: what a worker holds just before its commitment. */
    async admit(name: string) {
      const operationId = `${id}-${name}`;
      await createPendingOperation({
        id: operationId,
        tenantId: id,
        agentId: id,
        kind: "execute",
        actorKeyId: "key",
        requestHash: operationId,
        authorizationEpochs: { ownerEpoch: 1, policyEpoch: 1, lifecycleEpoch: 1 },
      });
      const claimed = await claimOperationDispatch(id, id, operationId, "pending", operationId);
      expect(claimed).toBe(true);
      return operationId;
    },
    commit: (operationId: string) =>
      commitExecutionDispatch(actor, id, operationId, transfer(operationId.slice(-30))),
    setCaps: (tx: Pick<DatabaseDriver["db"], "update">, next: Caps) =>
      tx
        .update(agents)
        .set({
          budgetDailyCents: next.daily ?? null,
          budgetWeeklyCents: next.weekly ?? null,
          budgetMonthlyCents: next.monthly ?? null,
          budgetRevision: sql`${agents.budgetRevision} + 1`,
        })
        .where(eq(agents.id, id)),
    async committedAt(operationId: string) {
      const [row] = await database.db
        .select({ at: operations.dispatchCommittedAt })
        .from(operations)
        .where(eq(operations.id, operationId));
      return row?.at ?? null;
    },
    charges: () => database.db.select().from(spendCharges).where(eq(spendCharges.agentId, id)),
    spent: async () => (await readBudgetFor(id, id)).daily.spent_usd,
    async cleanup() {
      await database.db.delete(spendCharges).where(eq(spendCharges.agentId, id));
      await database.db.delete(operationTombstones).where(eq(operationTombstones.agentId, id));
      await database.db.delete(auditEvents).where(eq(auditEvents.tenantId, id));
      await database.db.delete(operations).where(eq(operations.agentId, id));
      await database.db.delete(agents).where(eq(agents.tenantId, id));
      await database.db.delete(tenants).where(eq(tenants.id, id));
      await database.db.delete(user).where(eq(user.id, id));
    },
  };
}

/** Holds the agent row exclusively, as a budget change does, until `release` is called. */
async function holdAgent(
  database: DatabaseDriver,
  apply: (tx: DatabaseDriver["db"]) => Promise<unknown>,
) {
  let release!: () => void;
  let locked!: () => void;
  const ready = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const held = database.db.transaction(async (tx) => {
    await apply(tx as unknown as DatabaseDriver["db"]);
    locked();
    await gate;
  });
  await ready;
  return { release, done: held };
}

afterAll(async () => {
  if (!adminUrl) return;
  const admin = new pg.Pool({ connectionString: adminUrl });
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${raceDb} WITH (FORCE)`);
  } finally {
    await admin.end();
  }
});

describe.skipIf(!adminUrl)("spend-budget races against postgres (ticket 12)", () => {
  it("concurrent commitments never charge past the cap, and only the ones that fit dispatch", {
    timeout: 30_000,
  }, async () => {
    await resetRaceDatabase();
    configurePrices({ price: async () => oneDollar() });
    await withDatabase(raceUrl, async (database) => {
      // $3.50 a day fits three $1 transfers and not a fourth.
      const f = await fixture(database, { daily: 350 });
      try {
        const ids = await Promise.all(
          Array.from({ length: 24 }, (_, index) => f.admit(`op-${index}`)),
        );
        const outcomes = await Promise.all(ids.map((operationId) => settle(f.commit(operationId))));
        expect(outcomes.filter((outcome) => outcome === "committed")).toHaveLength(3);
        for (const outcome of outcomes)
          if (outcome !== "committed") expect(outcome).toBe("spend_budget_exceeded");
        expect(await f.spent()).toBe("3.000000");

        const charged = new Set((await f.charges()).map((row) => row.operationId));
        for (const [index, operationId] of ids.entries())
          expect(
            (await f.committedAt(operationId)) !== null,
            `${operationId} (${outcomes[index]})`,
          ).toBe(charged.has(operationId));
        expect(charged.size).toBe(3);
      } finally {
        await f.cleanup();
      }
    });
    configurePrices(undefined);
  });

  it("a cap that commits before an uncapped dispatch commits governs it", async () => {
    await resetRaceDatabase();
    await withDatabase(raceUrl, async (database) => {
      let lookups = 0;
      configurePrices({
        price: async () => {
          lookups += 1;
          return oneDollar();
        },
      });
      const f = await fixture(database, {});
      try {
        const operationId = await f.admit("first-cap");
        const owner = await holdAgent(database, (tx) => f.setCaps(tx, { daily: 50 }));
        const dispatch = settle(f.commit(operationId));
        await wait(150);
        owner.release();
        await owner.done;
        expect(await dispatch).toBe("spend_budget_exceeded");
        expect(lookups >= 1, "the cap that appeared is priced, outside any lock").toBe(true);
        expect(await f.committedAt(operationId)).toBeNull();
        expect(await f.charges()).toEqual([]);
      } finally {
        await f.cleanup();
      }
    });
    configurePrices(undefined);
  });

  it("a cap lowered before a dispatch commits is applied to it", async () => {
    await resetRaceDatabase();
    await withDatabase(raceUrl, async (database) => {
      configurePrices({ price: async () => oneDollar() });
      const f = await fixture(database, { daily: 200 });
      try {
        const operationId = await f.admit("lowered");
        const owner = await holdAgent(database, (tx) => f.setCaps(tx, { daily: 50 }));
        const dispatch = settle(f.commit(operationId));
        await wait(150);
        owner.release();
        await owner.done;
        expect(await dispatch).toBe("spend_budget_exceeded");
        expect(await f.committedAt(operationId)).toBeNull();
        expect(await f.charges()).toEqual([]);
      } finally {
        await f.cleanup();
      }
    });
    configurePrices(undefined);
  });

  it("a dispatch that commits first is charged under the old caps and cannot be retracted", async () => {
    await resetRaceDatabase();
    await withDatabase(raceUrl, async (database) => {
      configurePrices({ price: async () => oneDollar() });
      const f = await fixture(database, { daily: 200 });
      try {
        const winner = await f.admit("winner");
        const later = await f.admit("later");
        await f.commit(winner);
        await f.setCaps(database.db, { daily: 50 });
        expect(await f.spent()).toBe("1.000000");
        expect(await f.committedAt(winner)).toBeTruthy();
        expect((await f.charges())[0]?.state).toBe("committed");
        expect(await settle(f.commit(later))).toBe("spend_budget_exceeded");
        expect(await f.spent()).toBe("1.000000");
      } finally {
        await f.cleanup();
      }
    });
    configurePrices(undefined);
  });

  it("clearing configured caps keeps accounting so restoring caps cannot reset usage", async () => {
    await resetRaceDatabase();
    await withDatabase(raceUrl, async (database) => {
      let lookups = 0;
      configurePrices({
        price: async () => {
          lookups += 1;
          return oneDollar();
        },
      });
      const f = await fixture(database, { daily: 100 });
      try {
        await f.commit(await f.admit("capped"));
        await f.setCaps(database.db, {});
        const priced = lookups;
        await f.commit(await f.admit("uncapped"));
        expect(lookups, "configured budgets continue pricing while uncapped").toBe(priced + 1);
        expect(await f.spent(), "uncapped spending remains in the shared ledger").toBe("2.000000");
        await f.setCaps(database.db, { daily: 150 });
        expect(await settle(f.commit(await f.admit("again")))).toBe("spend_budget_exceeded");
      } finally {
        await f.cleanup();
      }
    });
    configurePrices(undefined);
  });

  it("a stalled worker that loses the commitment neither dispatches nor refunds the winner", async () => {
    await resetRaceDatabase();
    await withDatabase(raceUrl, async (database) => {
      configurePrices({ price: async () => oneDollar() });
      const f = await fixture(database, { daily: 100 });
      try {
        const operationId = await f.admit("shared");
        const outcomes = await Promise.all([
          settle(f.commit(operationId)),
          settle(f.commit(operationId)),
          settle(f.commit(operationId)),
        ]);
        expect(outcomes.filter((outcome) => outcome === "committed")).toHaveLength(1);
        for (const outcome of outcomes)
          if (outcome !== "committed") expect(outcome).toBe("operation_not_pending");
        const [charge] = await f.charges();
        expect(charge?.state).toBe("committed");
        expect(await f.spent()).toBe("1.000000");
        expect(await settle(f.commit(await f.admit("next")))).toBe("spend_budget_exceeded");
      } finally {
        await f.cleanup();
      }
    });
    configurePrices(undefined);
  });
});
