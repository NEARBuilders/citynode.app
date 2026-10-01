import { type OwnerIntentState, ownerIntents } from "@near-intents-agent-api/database";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";

export type OwnerIntentRecord = typeof ownerIntents.$inferSelect;
export type NewOwnerIntent = typeof ownerIntents.$inferInsert;

export async function insertOwnerIntent(row: NewOwnerIntent): Promise<OwnerIntentRecord> {
  const [inserted] = await getDatabase().insert(ownerIntents).values(row).returning();
  if (!inserted) throw new Error("owner_intent_insert_failed");
  return inserted;
}

export async function findOwnerIntent(
  tenantId: string,
  id: string,
): Promise<OwnerIntentRecord | undefined> {
  const [row] = await getDatabase()
    .select()
    .from(ownerIntents)
    .where(and(eq(ownerIntents.tenantId, tenantId), eq(ownerIntents.id, id)))
    .limit(1);
  return row;
}

export async function findOwnerIntentByIdempotencyKey(
  tenantId: string,
  idempotencyKey: string,
): Promise<OwnerIntentRecord | undefined> {
  const [row] = await getDatabase()
    .select()
    .from(ownerIntents)
    .where(
      and(eq(ownerIntents.tenantId, tenantId), eq(ownerIntents.idempotencyKey, idempotencyKey)),
    )
    .limit(1);
  return row;
}

/** The intent that owns an operation, when the operation was created for one. */
export async function findOwnerIntentForOperation(
  tenantId: string,
  agentId: string,
  operationId: string,
): Promise<OwnerIntentRecord | undefined> {
  const [row] = await getDatabase()
    .select()
    .from(ownerIntents)
    .where(
      and(
        eq(ownerIntents.tenantId, tenantId),
        eq(ownerIntents.agentId, agentId),
        eq(ownerIntents.operationId, operationId),
      ),
    )
    .orderBy(desc(ownerIntents.createdAt))
    .limit(1);
  return row;
}

export async function updateOwnerIntent(
  tenantId: string,
  id: string,
  values: {
    state?: OwnerIntentState;
    operationId?: string | null;
    result?: unknown;
    failureCode?: string | null;
  },
  expectedState?: OwnerIntentState,
): Promise<void> {
  await getDatabase()
    .update(ownerIntents)
    .set({ ...values, updatedAt: sql`now()` })
    .where(
      and(
        eq(ownerIntents.tenantId, tenantId),
        eq(ownerIntents.id, id),
        expectedState
          ? eq(ownerIntents.state, expectedState)
          : inArray(ownerIntents.state, ["pending_signature", "submitted"]),
      ),
    );
}

/** Newest first, keyed by `(created_at, id)`. */
export async function listOwnerIntents(
  tenantId: string,
  agentId: string,
  limit: number,
  before?: { createdAt: Date; id: string },
): Promise<OwnerIntentRecord[]> {
  return getDatabase()
    .select()
    .from(ownerIntents)
    .where(
      and(
        eq(ownerIntents.tenantId, tenantId),
        eq(ownerIntents.agentId, agentId),
        before
          ? or(
              lt(ownerIntents.createdAt, before.createdAt),
              and(eq(ownerIntents.createdAt, before.createdAt), lt(ownerIntents.id, before.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(ownerIntents.createdAt), desc(ownerIntents.id))
    .limit(limit);
}
