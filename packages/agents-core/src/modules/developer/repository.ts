import type { Tx } from "@near-intents-agent-api/database";
import { apiKeys, auditEvents, requestBuckets, tenants } from "@near-intents-agent-api/database";
import { and, count, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { getDatabase } from "../../lib/db.js";
import {
  type CommittedOperations,
  committedDelegatedOperations,
} from "../operations/dispatch-fence.js";

/** Repositories cannot map HTTP errors (see architecture.test.ts); the caller translates this. */
export class ApiKeyQuotaExceededError extends Error {
  constructor() {
    super("api_key_quota_exceeded");
  }
}

export type ApiKeyListRow = {
  id: string;
  name: string;
  prefix: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export async function upsertTenant(userId: string, tenantId: string) {
  const tenant = (
    await getDatabase()
      .insert(tenants)
      .values({ id: tenantId, ownerUserId: userId })
      .onConflictDoUpdate({
        target: tenants.ownerUserId,
        set: { ownerUserId: userId },
      })
      .returning({ id: tenants.id })
  )[0];
  if (!tenant) throw new Error("Tenant persistence failed");
  return tenant.id;
}

export function insertApiKey(
  client: Tx,
  input: {
    id: string;
    tenantId: string;
    name: string;
    tokenHash: string;
    prefix: string;
    expiresAt: Date;
  },
) {
  return client.insert(apiKeys).values(input);
}

export function insertAuditEvent(
  client: Tx,
  input: { tenantId: string; agentId?: string; action: string; resourceId: string },
) {
  return client.insert(auditEvents).values(input);
}

/** Persists a developer-created API key within the tenant's cap on live keys. */
export async function persistApiKey(
  input: {
    id: string;
    tenantId: string;
    name: string;
    tokenHash: string;
    prefix: string;
    expiresAt: Date;
  },
  limit: number,
) {
  await getDatabase().transaction(async (tx) => {
    // Locks the tenant row before counting, for the same race-free reason as `insertAgent`.
    const [tenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, input.tenantId))
      .for("update");
    if (!tenant) throw new Error("persistApiKey: tenant not found");
    const [row] = await tx
      .select({ total: count() })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.tenantId, input.tenantId),
          isNull(apiKeys.revokedAt),
          gt(apiKeys.expiresAt, sql`now()`),
        ),
      );
    if ((row?.total ?? 0) >= limit) throw new ApiKeyQuotaExceededError();
    await insertApiKey(tx, input);
    await insertAuditEvent(tx, {
      tenantId: input.tenantId,
      action: "api_key.created",
      resourceId: input.id,
    });
  });
}

export async function selectApiKeys(tenantId: string): Promise<ApiKeyListRow[]> {
  return getDatabase()
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.tenantId, tenantId))
    .orderBy(desc(apiKeys.createdAt))
    .limit(100);
}

export async function findApiKey(tokenHash: string) {
  return (
    await getDatabase()
      .select({
        id: apiKeys.id,
        tenantId: apiKeys.tenantId,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.tokenHash, tokenHash),
          isNull(apiKeys.revokedAt),
          gt(apiKeys.expiresAt, sql`now()`),
        ),
      )
  )[0];
}

/**
 * Fixed-window request counter for one bucket: `key:<apiKeyId>` per credential and
 * `tenant:<tenantId>` for the tenant-wide ceiling. The per-key bucket keeps one noisy credential
 * from consuming its siblings' share; the tenant bucket bounds the sum across all keys.
 */
export async function consumeQuota(bucketKey: string, tx?: Tx) {
  const windowStart = sql<Date>`date_trunc('minute', now())`;
  const usage = (
    await (tx ?? getDatabase())
      .insert(requestBuckets)
      .values({ key: bucketKey, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: requestBuckets.key,
        set: {
          count: sql`CASE WHEN ${requestBuckets.windowStart} = date_trunc('minute', now()) THEN ${requestBuckets.count} + 1 ELSE 1 END`,
          windowStart,
        },
      })
      .returning({ count: requestBuckets.count })
  )[0];
  if (!usage) throw new Error("Rate limit persistence failed");
  return usage.count;
}

/**
 * Removes rate-limit buckets from closed windows. A bucket is only meaningful for the minute it
 * counts, so anything older is dead weight that would otherwise grow one row per key per minute
 * forever.
 */
export async function sweepExpiredRequestBuckets() {
  const deleted = await getDatabase()
    .delete(requestBuckets)
    .where(lt(requestBuckets.windowStart, sql`now() - interval '1 hour'`))
    .returning({ key: requestBuckets.key });
  return deleted.length;
}

/**
 * Revokes a key and returns the delegated operations it had already committed to dispatch. The
 * update waits for in-flight dispatch commitments that share-lock this row, so every later
 * commitment is refused and every earlier one is reported, up to the report bound. Null when the
 * key does not exist.
 */
export async function revokeApiKey(
  tenantId: string,
  id: string,
): Promise<CommittedOperations | null> {
  return getDatabase().transaction(async (tx) => {
    const result = await tx
      .update(apiKeys)
      .set({ revokedAt: sql`coalesce(${apiKeys.revokedAt}, now())` })
      .where(and(eq(apiKeys.tenantId, tenantId), eq(apiKeys.id, id)))
      .returning({ id: apiKeys.id });
    if (!result.length) return null;
    await insertAuditEvent(tx, { tenantId, action: "api_key.revoked", resourceId: id });
    return committedDelegatedOperations(tx, tenantId, { keyId: id });
  });
}
