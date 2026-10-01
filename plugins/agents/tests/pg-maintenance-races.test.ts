import { setTimeout as sleep } from "node:timers/promises";
import { sweepUnsettledPolicies } from "@near-intents-agent-api/agents-core";
import {
  agents,
  auditEvents,
  operations,
  operationTombstones,
  tenants,
  user,
} from "@near-intents-agent-api/database";
import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { DatabaseDriver } from "../src/db";
import {
  dropRaceDatabase,
  raceDatabaseUrl,
  raceSuitesEnabled,
  resetRaceDatabase,
  withDatabase,
} from "./support/race-db";

const twoHoursAgo = () => new Date(Date.now() - 2 * 60 * 60_000);

async function seed(database: DatabaseDriver) {
  const id = crypto.randomUUID();
  await database.db.insert(user).values({ id, name: "maintenance", email: `${id}@test.invalid` });
  await database.db.insert(tenants).values({ id, ownerUserId: id });
  const agent = async (name: string) => {
    const agentId = `${id}-${name}`;
    await database.db
      .insert(agents)
      .values({ id: agentId, tenantId: id, name, createdAt: twoHoursAgo() });
    return agentId;
  };
  const interrupted = async (agentId: string) => {
    const operationId = `${agentId}-preparation`;
    await database.db.insert(operations).values({
      id: operationId,
      tenantId: id,
      agentId,
      kind: "policy",
      action: "onboarding",
      requestHash: operationId,
      status: "uncertain",
      result: {},
      updatedAt: twoHoursAgo(),
    });
    return operationId;
  };
  const state = async (agentId: string, operationId?: string) => {
    const [agent] = await database.db.select().from(agents).where(eq(agents.id, agentId));
    const [operation] = operationId
      ? await database.db.select().from(operations).where(eq(operations.id, operationId))
      : [];
    const events = await database.db
      .select({ action: auditEvents.action })
      .from(auditEvents)
      .where(eq(auditEvents.agentId, agentId));
    return { lifecycle: agent?.lifecycle, operation, events: events.map((e) => e.action) };
  };
  const cleanup = async () => {
    await database.db.delete(auditEvents).where(eq(auditEvents.tenantId, id));
    await database.db.delete(operations).where(eq(operations.tenantId, id));
    await database.db.delete(operationTombstones).where(eq(operationTombstones.tenantId, id));
    await database.db.delete(agents).where(eq(agents.tenantId, id));
    await database.db.delete(tenants).where(eq(tenants.id, id));
    await database.db.delete(user).where(eq(user.id, id));
  };
  return { agent, interrupted, state, cleanup };
}

type Tx = Parameters<DatabaseDriver["db"]["transaction"]>[0] extends (
  tx: infer T,
) => Promise<unknown>
  ? T
  : never;

/**
 * Runs `work` in its own connection and holds the transaction open until released, so a sweep
 * sampled meanwhile sees the state before `work` and has to decide against the state after it.
 */
async function hold(database: DatabaseDriver, work: (tx: Tx) => Promise<void>) {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ready!: () => void;
  const started = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const done = database.db.transaction(async (tx) => {
    await work(tx as unknown as Tx);
    ready();
    await released;
  });
  await Promise.race([started, done]);
  return { release, done };
}

/** Resolves once the sweep blocks on a row lock, or finishes without needing one. */
async function blockedOrDone(database: DatabaseDriver, sweep: Promise<unknown>) {
  let finished = false;
  void sweep.finally(() => {
    finished = true;
  });
  for (let attempt = 0; attempt < 400 && !finished; attempt += 1) {
    const { rows } = await database.db.execute<{ waiting: number }>(
      sql`SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if ((rows[0]?.waiting ?? 0) > 0) return;
    await sleep(10);
  }
}

afterAll(() => dropRaceDatabase("agents_maintenance_race_test"));

describe.skipIf(!raceSuitesEnabled())("maintenance races against postgres (ticket 12)", () => {
  it("a stale interrupted-preparation sweep never fails work that progressed", {
    timeout: 30_000,
  }, async () => {
    await resetRaceDatabase("agents_maintenance_race_test");
    await withDatabase(raceDatabaseUrl("agents_maintenance_race_test"), async (database) => {
      const { agent, interrupted, state, cleanup } = await seed(database);
      try {
        const progress = {
          "preparation stored": {
            status: "pending" as const,
            result: {
              status: "pending_wallet_signature",
              policy_id: "policy-1",
              onboarding: true,
            },
          },
          "relay hash journaled": {
            status: "uncertain" as const,
            result: {
              status: "dispatching",
              policy_id: "policy-1",
              onboarding: true,
              transaction_hash: "tx-1",
            },
          },
          "already settled": {
            status: "completed" as const,
            result: { status: "applied", policy_id: "policy-1", transaction_hash: "tx-1" },
          },
        };
        for (const [name, next] of Object.entries(progress)) {
          const agentId = await agent(name.replaceAll(" ", "-"));
          const operationId = await interrupted(agentId);
          // A resumed worker writes its progress; the sweep samples the row before that commits.
          const worker = await hold(database, async (tx) => {
            await tx
              .update(operations)
              .set({ ...next, updatedAt: sql`clock_timestamp()` })
              .where(eq(operations.id, operationId));
          });
          const sweep = sweepUnsettledPolicies();
          await blockedOrDone(database, sweep);
          worker.release();
          await worker.done;
          await sweep;
          const after = await state(agentId, operationId);
          expect(after.operation?.status, name).toBe(next.status);
          expect(after.operation?.result, name).toEqual(next.result);
          expect(after.lifecycle, name).toBe("pending");
          expect(after.events, name).toEqual([]);
        }
      } finally {
        await cleanup();
      }
    });
  });

  it("concurrent sweeps fail a truly interrupted preparation once", async () => {
    await resetRaceDatabase("agents_maintenance_race_test");
    await withDatabase(raceDatabaseUrl("agents_maintenance_race_test"), async (database) => {
      const { agent, interrupted, state, cleanup } = await seed(database);
      try {
        const agentId = await agent("interrupted");
        const operationId = await interrupted(agentId);
        await Promise.all([sweepUnsettledPolicies(), sweepUnsettledPolicies()]);
        const after = await state(agentId, operationId);
        expect(after.operation?.status).toBe("failed");
        expect(after.operation?.result).toEqual({
          status: "failed",
          failure_code: "preparation_interrupted",
        });
        expect(after.lifecycle).toBe("abandoned");
        expect(after.events.sort()).toEqual(["agent.abandoned", "policy.failed"]);
      } finally {
        await cleanup();
      }
    });
  });
});
