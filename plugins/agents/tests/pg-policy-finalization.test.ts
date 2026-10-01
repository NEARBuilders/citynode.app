import { configureDatabase, finalizePolicyOperation } from "@near-intents-agent-api/agents-core";
import {
  agents,
  auditEvents,
  operations,
  tenants,
  user,
  walletPolicies,
} from "@near-intents-agent-api/database";
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";
import { PluginIdTag } from "every-plugin";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";
import type { DatabaseDriver } from "../src/db";
import { DatabaseLive, DatabaseTag } from "../src/db/layer";

const adminUrl = process.env.AGENTS_RACE_DATABASE_URL;
const raceDb = "agents_finalize_race_test";
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

function withDatabase(run: (driver: DatabaseDriver) => Promise<void>): Promise<void> {
  const layer = DatabaseLive(raceUrl).pipe(Layer.provide(Layer.succeed(PluginIdTag, "agents")));
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

async function seed(database: DatabaseDriver) {
  const id = crypto.randomUUID();
  await database.db.insert(user).values({ id, name: "finalize", email: `${id}@test.invalid` });
  await database.db.insert(tenants).values({ id, ownerUserId: id });
  await database.db.insert(agents).values({ id, tenantId: id, name: "finalize" });
  let version = 0;
  const revision = async (transactionHash: string | null) => {
    version += 1;
    const policyId = `${id}-policy-${version}`;
    const operationId = `${id}-operation-${version}`;
    await database.db.insert(walletPolicies).values({
      id: policyId,
      tenantId: id,
      agentId: id,
      walletId: id,
      version,
      policyHash: policyId,
      encryptedData: "sealed",
      signatureHex: "0".repeat(128),
      publicKeyHex: "0".repeat(64),
      rules: { frozen: false },
      status: "signed",
    });
    const [agent] = await database.db.select().from(agents).where(eq(agents.id, id));
    expect(agent).toBeTruthy();
    const [inserted] = await database.db
      .insert(operations)
      .values({
        id: operationId,
        tenantId: id,
        agentId: id,
        kind: "policy",
        requestHash: operationId,
        status: "uncertain",
        result: { status: "submitted", policy_id: policyId, transaction_hash: transactionHash },
        authorizedOwnerEpoch: agent?.ownerEpoch,
        authorizedPolicyEpoch: agent?.policyEpoch,
        authorizedLifecycleEpoch: agent?.lifecycleEpoch,
      })
      .returning();
    const operation = inserted!;
    expect(operation).toBeTruthy();
    return { policyId, operation };
  };
  const state = async (policyId: string, operationId: string) => {
    const [agent] = await database.db.select().from(agents).where(eq(agents.id, id));
    const [operation] = await database.db
      .select()
      .from(operations)
      .where(eq(operations.id, operationId));
    const [policy] = await database.db
      .select()
      .from(walletPolicies)
      .where(eq(walletPolicies.id, policyId));
    const applied = await database.db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.action, "policy.applied"), eq(auditEvents.resourceId, policyId)));
    expect(agent && operation && policy).toBeTruthy();
    return { epoch: agent?.policyEpoch, operation, policy, appliedEvents: applied.length };
  };
  const cleanup = async () => {
    await database.db.delete(auditEvents).where(eq(auditEvents.tenantId, id));
    await database.db.delete(operations).where(eq(operations.tenantId, id));
    await database.db.delete(walletPolicies).where(eq(walletPolicies.tenantId, id));
    await database.db.delete(agents).where(eq(agents.tenantId, id));
    await database.db.delete(tenants).where(eq(tenants.id, id));
    await database.db.delete(user).where(eq(user.id, id));
  };
  return { id, revision, state, cleanup };
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

describe.skipIf(!adminUrl)("policy finalization races against postgres (ticket 12)", () => {
  it("concurrent policy confirmations apply a revision and advance its epoch once", async () => {
    await resetRaceDatabase();
    await withDatabase(async (database) => {
      configureDatabase(database);
      const { id, revision, state, cleanup } = await seed(database);
      try {
        const { policyId, operation } = await revision("tx-applied");
        const before = await state(policyId, operation.id);
        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            finalizePolicyOperation({
              tenantId: id,
              agentId: id,
              operationId: operation.id,
              policyId,
              observed: operation,
              outcome: { status: "applied", transactionHash: "tx-applied" },
              result: { status: "applied", transaction_hash: "tx-applied" },
            }),
          ),
        );
        for (const result of results) expect(result?.status).toBe("completed");
        const after = await state(policyId, operation.id);
        expect(after.epoch).toBe((before.epoch ?? 0) + 1);
        expect(after.appliedEvents).toBe(1);
        expect(after.policy?.status).toBe("applied");
      } finally {
        await cleanup();
      }
    });
  });

  it("racing success and failure settle policy and operation consistently", async () => {
    await resetRaceDatabase();
    await withDatabase(async (database) => {
      configureDatabase(database);
      const { id, revision, state, cleanup } = await seed(database);
      try {
        for (const order of ["applied-first", "failed-first"] as const) {
          const { policyId, operation } = await revision(`tx-${order}`);
          const settle = (status: "applied" | "failed") =>
            finalizePolicyOperation({
              tenantId: id,
              agentId: id,
              operationId: operation.id,
              policyId,
              observed: operation,
              outcome:
                status === "applied"
                  ? { status, transactionHash: `tx-${order}` }
                  : { status, failureCode: "policy_transaction_dropped" },
              result: { status, transaction_hash: `tx-${order}` },
            });
          await Promise.allSettled(
            order === "applied-first"
              ? [settle("applied"), settle("failed")]
              : [settle("failed"), settle("applied")],
          );
          const { operation: settled, policy } = await state(policyId, operation.id);
          expect(
            (settled?.status === "completed" && policy?.status === "applied") ||
              (settled?.status === "failed" && policy?.status === "failed"),
            `${order}: operation ${settled?.status} with policy ${policy?.status}`,
          ).toBe(true);
        }
      } finally {
        await cleanup();
      }
    });
  });
});
